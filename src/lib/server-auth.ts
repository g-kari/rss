import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyJwt, refreshTokens, getJwtExp, type RefreshResult } from "./auth";
import { apiError, formatError } from "./api-error";
import { isCsrfViolation } from "./csrf";
import { checkAndUpdateCooldown } from "./rate-limit";
import { generateDbscChallenge } from "./dbsc";
import { isBetaAllowed } from "./beta-allowed";
import { getDevBypassUserId } from "./dev-auth-bypass";

// CSRF 判定ロジックは next/* を含まない形でユニットテスト可能にするため `./csrf` に分離している。
export { isCsrfViolation } from "./csrf";
export { getJwtExp } from "./auth";
// isBetaAllowed も同様に next/* に依存しないため `./beta-allowed` に分離している。
export { isBetaAllowed } from "./beta-allowed";

/**
 * CSRF 違反の場合に 403 NextResponse を、合格時は null を返すラッパー。
 * Route Handler 内の `withSession` / `withBinarySession` で使う。
 */
export function assertSameOrigin(
  req: Request,
  appBaseUrl: string | undefined,
): NextResponse | null {
  return isCsrfViolation(req, appBaseUrl)
    ? apiError("Forbidden", 403, { code: "CSRF_ORIGIN_MISMATCH" })
    : null;
}

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

// セッション Cookie 名と有効期限
export const SESSION_COOKIE = "session_id";
const SESSION_MAX_AGE_SECS = 30 * 24 * 60 * 60; // 30日
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** サーバーサイドセッション（R2 保存内容） */
interface ServerSessionData {
  userId: string;
  refreshToken: string;
  expiresAt: number; // Unix 秒
  // TODO: DBSC バインディング — デバイス鍵が登録された際にセットする
  // DBSC（Device Bound Session Credentials）でセッションをデバイスの TPM に紐付けるための識別子。
  // ブラウザが /api/auth/dbsc/register で公開鍵を登録した後、このフィールドに sessionId を保存する。
  // トークンリフレッシュ時にこのフィールドが存在する場合は DBSC チャレンジを要求すること。
  // @see https://wicg.github.io/dbsc/
  dbscSessionId?: string;
}

/** sessionId を R2 キーに変換。UUID 形式でない場合はパストラバーサル防止のため null を返す */
function buildSessionKey(sessionId: string): string | null {
  return SESSION_ID_RE.test(sessionId) ? `sessions/${sessionId}.json` : null;
}

/** R2 にセッションを作成し、生成した sessionId を返す */
export async function createServerSession(
  r2: R2Bucket,
  userId: string,
  refreshToken: string,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const data: ServerSessionData = {
    userId,
    refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECS,
  };
  await r2.put(`sessions/${sessionId}.json`, JSON.stringify(data));
  return sessionId;
}

/** R2 からセッションを取得する。存在しない・期限切れの場合は null を返す */
export async function getServerSession(
  r2: R2Bucket,
  sessionId: string,
): Promise<ServerSessionData | null> {
  const key = buildSessionKey(sessionId);
  if (!key) return null;
  try {
    const obj = await r2.get(key);
    if (!obj) return null;
    const data = (await obj.json()) as ServerSessionData;
    if (data.expiresAt < Math.floor(Date.now() / 1000)) {
      r2.delete(key).catch(() => {});
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** トークンローテーション後に R2 セッションを新しい refreshToken で上書きする */
export async function updateServerSession(
  r2: R2Bucket,
  sessionId: string,
  userId: string,
  refreshToken: string,
): Promise<void> {
  const key = buildSessionKey(sessionId);
  if (!key) return;
  const data: ServerSessionData = {
    userId,
    refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECS,
  };
  await r2.put(key, JSON.stringify(data)).catch((e) => {
    console.error("[updateServerSession] failed:", e);
  });
}

/** R2 からセッションを削除する（ログアウト時） */
export async function deleteServerSession(r2: R2Bucket, sessionId: string): Promise<void> {
  const key = buildSessionKey(sessionId);
  if (!key) return;
  await r2.delete(key).catch(() => {});
}

/**
 * サーバーサイドセッションに DBSC セッション ID を紐付ける。
 * セッションが存在しない場合は false を返す。
 */
export async function bindDbscToServerSession(
  r2: R2Bucket,
  sessionId: string,
  dbscSessionId: string,
): Promise<boolean> {
  if (!SESSION_ID_RE.test(sessionId)) return false;
  const serverSession = await getServerSession(r2, sessionId);
  if (!serverSession) return false;
  await r2.put(`sessions/${sessionId}.json`, JSON.stringify({ ...serverSession, dbscSessionId }));
  return true;
}

/** inflightRefresh エントリの TTL（ミリ秒）*/
const INFLIGHT_TTL_MS = 30_000;
/** inflightRefresh の最大サイズ（超過時は最古エントリを 1 件削除）*/
const INFLIGHT_MAX_SIZE = 100;

type InflightEntry = { promise: Promise<RefreshResult>; ts: number };

/** リフレッシュリクエストの重複実行を防ぐ Map（refreshToken → { promise, ts }） */
const inflightRefresh = new Map<string, InflightEntry>();

/**
 * 古い inflight エントリを削除する。
 * - INFLIGHT_TTL_MS 以上前のエントリを削除
 * - サイズが INFLIGHT_MAX_SIZE を超える場合は最古エントリを 1 件だけ削除する
 *
 * 全クリアにすると進行中の Promise への参照が消え、deduplication が機能しなくなり、
 * 同一 refreshToken で複数の並行 refresh が発生して使い捨てトークンの 2 回使用 →
 * セッション無効化を誘発するリスクがあるため、個別削除で deduplication を保護する (#613)。
 */
function cleanupInflight(): void {
  const cutoff = Date.now() - INFLIGHT_TTL_MS;
  for (const [key, entry] of inflightRefresh) {
    if (entry.ts < cutoff) inflightRefresh.delete(key);
  }
  if (inflightRefresh.size > INFLIGHT_MAX_SIZE) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [key, entry] of inflightRefresh) {
      if (entry.ts < oldestTs) {
        oldestTs = entry.ts;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) inflightRefresh.delete(oldestKey);
  }
}

/**
 * refreshTokens の重複呼び出しを deduplication する。
 *
 * **問題**: Cloudflare Workers は同一アイソレート内で複数のリクエストを並行処理する場合がある。
 * アクセストークンが期限切れになると、同時に届いた複数のリクエストがそれぞれ
 * refreshTokens() を呼び出し、同じリフレッシュトークンで並行して交換リクエストが発生する。
 * リフレッシュトークンは使い捨て（one-time-use）のため、2 回目以降の呼び出しは失敗し
 * ユーザーが意図せずログアウト状態になってしまう。
 *
 * **解決策**: inflightRefresh Map で進行中の Promise を管理し、
 * 同じ refreshToken への呼び出しは最初の Promise を返すことで 1 回だけ実行する。
 *
 * **制約**: `inflightRefresh` はモジュールレベルの Map のため、
 * deduplication は同一アイソレート内に限定される。
 * 異なるアイソレート間（別の Workers インスタンス）では独立して動作する。
 */
export function deduplicatedRefresh(refreshToken: string): Promise<RefreshResult> {
  cleanupInflight();
  const existing = inflightRefresh.get(refreshToken);
  if (existing) return existing.promise;
  const p = refreshTokens(refreshToken)
    // 想定外の reject は transient として扱う。500 ではなく 503/ログアウト保留にフォールバックさせる。
    .catch((): RefreshResult => ({ kind: "transient" }))
    .finally(() => {
      // 自分の Promise だけ削除する。完了後に別の Promise が登録されていれば触らない。
      const current = inflightRefresh.get(refreshToken);
      if (current?.promise === p) inflightRefresh.delete(refreshToken);
    });
  inflightRefresh.set(refreshToken, { promise: p, ts: Date.now() });
  return p;
}

/** JWT ペイロードから AuthSession を構築する。ベータ制限に引っかかる場合は null を返す */
function sessionFromPayload(
  payload: { sub: string },
  refreshedTokens?: { access_token: string; sessionId?: string },
): AuthSession | null {
  // sub は R2 キー（users/{sub}/...）に直接埋め込まれるため、
  // パストラバーサル対策としてセーフな文字のみ許可する
  if (!/^[A-Za-z0-9_\-@.]{1,128}$/.test(payload.sub)) return null;
  if (!isBetaAllowed(payload.sub)) return null;
  return { userId: payload.sub, refreshedTokens };
}

export interface AuthSession {
  userId: string;
  /**
   * リフレッシュ成功時のみ存在。applyRefreshedTokens で access_token Cookie を更新するために使う。
   * sessionId がある場合は session_id Cookie も延長する。
   */
  refreshedTokens?: { access_token: string; sessionId?: string };
}

/**
 * Cookie からユーザー ID を取得する。
 * null の場合は認証失敗。refreshedTokens がある場合はレスポンスに cookie をセットすること。
 */
export async function getAuthSession(): Promise<AuthSession | null | { dbscChallenge: string }> {
  // 開発時の認証バイパス（e2e テスト用）。詳細は `dev-auth-bypass.ts` を参照。
  const bypassUserId = getDevBypassUserId();
  if (bypassUserId) return { userId: bypassUserId };

  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (token) {
    const payload = await verifyJwt(token, authBaseUrl);
    if (payload) return sessionFromPayload(payload);
  }

  // アクセストークン期限切れ → サーバーサイドセッション経由でリフレッシュ試行
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const { env } = await getCloudflareContext({ async: true });
  const sessionData = await getServerSession(env.RSS_DATA, sessionId);
  if (!sessionData) return null;

  // DBSC バインディング済みセッション: チャレンジを発行して鍵所持証明を要求する
  if (sessionData.dbscSessionId) {
    // 防御的検証: R2 から読み出した dbscSessionId を再度 UUID 形式チェック（パストラバーサル防止）
    if (!SESSION_ID_RE.test(sessionData.dbscSessionId)) {
      console.warn("[server-auth] invalid dbscSessionId in stored session, treating as unbound");
      return null;
    }
    const challenge = generateDbscChallenge();
    await env.RSS_DATA.put(
      `users/${sessionData.userId}/dbsc-challenge-${sessionData.dbscSessionId}.json`,
      JSON.stringify({ challenge, expiresAt: Date.now() + 5 * 60 * 1000 }),
    );
    return { dbscChallenge: challenge };
  }

  const refreshed = await deduplicatedRefresh(sessionData.refreshToken);
  if (refreshed.kind === "ok") {
    const payload = await verifyJwt(refreshed.tokens.access_token, authBaseUrl);
    if (payload) {
      // R2 セッションを新しい refreshToken で更新（fire-and-forget 可だが await して整合性を優先）
      await updateServerSession(
        env.RSS_DATA,
        sessionId,
        sessionData.userId,
        refreshed.tokens.refresh_token,
      );
      return sessionFromPayload(payload, {
        access_token: refreshed.tokens.access_token,
        sessionId,
      });
    }
  }
  // refreshed.kind === "invalid" or "transient" のいずれも null を返す。
  // Cookie 削除は me/route のみが担う（並行 refresh 競合で Cookie が消える問題を防ぐ）。
  return null;
}

/** セッション取得 + 認証失敗時は 401 を返すヘルパー。
 * Cookie の削除は行わない（me/route のみが担う）。
 * これにより、並行リクエストの refresh 競合で Cookie が消える問題を防ぐ。
 */
export async function requireSession(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const session = await getAuthSession();
  if (!session) {
    return { error: apiError("Unauthorized", 401, { code: "UNAUTHORIZED" }) };
  }
  if ("dbscChallenge" in session) {
    const res = apiError("Session challenge required", 401, { code: "DBSC_CHALLENGE_REQUIRED" });
    res.headers.set("Sec-Session-Challenge", `challenge="${session.dbscChallenge}"`);
    return { error: res };
  }
  return { session };
}

/** access_token と token_exp Cookie をセットする */
export function setAccessTokenCookies(response: NextResponse, accessToken: string): void {
  response.cookies.set("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 900 });
  const exp = getJwtExp(accessToken);
  if (exp !== null) {
    response.cookies.set("token_exp", String(exp), {
      maxAge: 900,
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  }
}

/** session_id Cookie をセットする（ログイン時に一度だけ呼ぶ） */
export function setSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(SESSION_COOKIE, sessionId, {
    ...COOKIE_OPTS,
    maxAge: SESSION_MAX_AGE_SECS,
  });
}

/** リフレッシュされた access_token がある場合に NextResponse に cookie をセットする */
export function applyRefreshedTokens(response: NextResponse, session: AuthSession): NextResponse {
  if (session.refreshedTokens) {
    setAccessTokenCookies(response, session.refreshedTokens.access_token);
    if (session.refreshedTokens.sessionId) {
      setSessionCookie(response, session.refreshedTokens.sessionId);
    }
  }
  return response;
}

/**
 * 認証済みリクエストのボイラープレートを共通化するラッパー。
 * - requireSession() でセッション取得（失敗時は 401 を返す）
 * - getCloudflareContext() で env / ctx を取得
 * - ハンドラの戻り値に applyRefreshedTokens() を自動適用
 *
 * @example
 * export async function GET() {
 *   return withSession(async ({ session, env }) => {
 *     const data = await r2Get(env.RSS_DATA, `users/${session.userId}/data.json`, []);
 *     return NextResponse.json(data);
 *   });
 * }
 */
export async function withSession(
  req: Request,
  handler: (params: {
    session: AuthSession;
    env: CloudflareEnv;
    ctx: ExecutionContext;
  }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const csrf = assertSameOrigin(req, process.env.APP_BASE_URL);
  if (csrf) return csrf;
  const result = await requireSession();
  if ("error" in result) return result.error;
  const { env, ctx } = await getCloudflareContext({ async: true });
  const requestId = crypto.randomUUID().slice(0, 8);
  const url = new URL(req.url);
  console.log(
    `[access] ${req.method} ${url.pathname} userId=${result.session.userId} requestId=${requestId}`,
  );
  try {
    const response = await handler({ session: result.session, env, ctx });
    return applyRefreshedTokens(response, result.session);
  } catch (err) {
    // スタックトレースにシークレットが含まれるリスクを避けるため、メッセージのみをログに出力する
    const name = err instanceof Error ? err.name : "UnknownError";
    const incident = crypto.randomUUID().slice(0, 8);
    console.error(
      `[withSession] unhandled error requestId=${requestId} incident=${incident}:`,
      name,
      formatError(err),
    );
    return apiError("Internal Server Error", 500, { code: "INTERNAL_ERROR", incident });
  }
}

/**
 * unknown 値を string に変換する。
 * 非 string・空文字・maxLength 超過のいずれかに該当する場合は null を返す。
 */
export function requireString(value: unknown, maxLength = 128): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  return value;
}

/**
 * リクエストボディを JSON としてパースする。
 * 不正な JSON の場合は ok: false と 400 エラーレスポンスを返す。
 *
 * @example
 * const parsed = await parseJsonBody<{ url?: unknown }>(request);
 * if (!parsed.ok) return parsed.error;
 * const body = parsed.data;
 */
export async function parseJsonBody<T>(
  request: Request,
): Promise<{ ok: true; data: T } | { ok: false; error: NextResponse }> {
  const text = await request.text();
  // 512KB を超えるペイロードは Worker OOM の原因になるため拒否する
  if (text.length > 512 * 1024) {
    return {
      ok: false,
      error: apiError("Payload too large", 413, { code: "PAYLOAD_TOO_LARGE" }),
    };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: apiError("Invalid JSON", 400, { code: "INVALID_JSON" }) };
  }
}

export async function withJsonBody<T>(
  req: Request,
  handler: (params: {
    body: T;
    session: AuthSession;
    env: CloudflareEnv;
    ctx: ExecutionContext;
  }) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withSession(req, async (params) => {
    const parsed = await parseJsonBody<T>(req);
    if (!parsed.ok) return parsed.error;
    return handler({ ...params, body: parsed.data });
  });
}

/**
 * クールダウンチェック。制限中なら 429 NextResponse を返し、通過なら null を返す。
 * Route Handler の重複 import を削減するためのラッパー。
 */
export async function applyCooldown(
  kv: KVNamespace,
  key: string,
  ms: number,
): Promise<NextResponse | null> {
  return checkAndUpdateCooldown(kv, key, ms);
}

/**
 * バイナリレスポンス（Response）を返す Route Handler 用の withSession 相当ラッパー。
 * image-proxy など NextResponse を使わないエンドポイントで使用する。
 * - requireSession() でセッション取得（失敗時は 401 を返す）
 * - getCloudflareContext() で env / ctx を取得
 * - ハンドラの戻り値に applyRefreshedTokensToResponse() を自動適用
 *
 * @example
 * export async function GET(request: Request) {
 *   return withBinarySession(({ ctx }) => handleGet(request, ctx));
 * }
 */
export async function withBinarySession(
  req: Request,
  handler: (params: {
    session: AuthSession;
    env: CloudflareEnv;
    ctx: ExecutionContext;
  }) => Promise<Response>,
): Promise<Response> {
  const csrf = assertSameOrigin(req, process.env.APP_BASE_URL);
  if (csrf) return csrf;
  const result = await requireSession();
  if ("error" in result) return result.error;
  const { env, ctx } = await getCloudflareContext({ async: true });
  const requestId = crypto.randomUUID().slice(0, 8);
  const url = new URL(req.url);
  console.log(
    `[access] ${req.method} ${url.pathname} userId=${result.session.userId} requestId=${requestId}`,
  );
  try {
    const response = await handler({ session: result.session, env, ctx });
    return applyRefreshedTokensToResponse(response, result.session);
  } catch (err) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const incident = crypto.randomUUID().slice(0, 8);
    console.error(
      `[withBinarySession] unhandled error requestId=${requestId} incident=${incident}:`,
      name,
      formatError(err),
    );
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * バイナリレスポンス（Response）にもリフレッシュ済み access_token Cookie をセットする。
 * image-proxy など NextResponse を使わないエンドポイント用。
 */
export function applyRefreshedTokensToResponse(response: Response, session: AuthSession): Response {
  if (!session.refreshedTokens) return response;
  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  setAccessTokenCookies(nextResponse, session.refreshedTokens.access_token);
  if (session.refreshedTokens.sessionId) {
    setSessionCookie(nextResponse, session.refreshedTokens.sessionId);
  }
  return nextResponse;
}
