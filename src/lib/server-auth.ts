import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyJwt, refreshTokens, type RefreshResult } from "./auth";
import { apiError } from "./api-error";
import { isCsrfViolation } from "./csrf";

// CSRF 判定ロジックは next/* を含まない形でユニットテスト可能にするため `./csrf` に分離している。
export { isCsrfViolation } from "./csrf";

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

/** リフレッシュリクエストの重複実行を防ぐ Map（refreshToken → Promise） */
const inflightRefresh = new Map<string, Promise<RefreshResult>>();

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
  const inflight = inflightRefresh.get(refreshToken);
  if (inflight) return inflight;
  const p = refreshTokens(refreshToken)
    // 想定外の reject は transient として扱う。500 ではなく 503/ログアウト保留にフォールバックさせる。
    .catch((): RefreshResult => ({ kind: "transient" }))
    .finally(() => {
      // 自分の Promise だけ削除する。完了後に別の Promise が登録されていれば触らない。
      if (inflightRefresh.get(refreshToken) === p) {
        inflightRefresh.delete(refreshToken);
      }
    });
  inflightRefresh.set(refreshToken, p);
  return p;
}

/** JWT ペイロードの exp クレームを base64 デコードで取得する（署名検証なし） */
export function getJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** BETA_ALLOWED_SUBS が設定されている場合、sub がリストに含まれるか確認 */
export function isBetaAllowed(sub: string): boolean {
  const list = process.env.BETA_ALLOWED_SUBS?.trim();
  if (!list) return true;
  return list.split(",").some((s) => s.trim() === sub);
}

/** JWT ペイロードから AuthSession を構築する。ベータ制限に引っかかる場合は null を返す */
function sessionFromPayload(
  payload: { sub: string },
  refreshedTokens?: { access_token: string; refresh_token: string },
): AuthSession | null {
  // sub は R2 キー（users/{sub}/...）に直接埋め込まれるため、
  // パストラバーサル対策としてセーフな文字のみ許可する
  if (!/^[A-Za-z0-9_\-@.]{1,128}$/.test(payload.sub)) return null;
  if (!isBetaAllowed(payload.sub)) return null;
  return { userId: payload.sub, refreshedTokens };
}

export interface AuthSession {
  userId: string;
  refreshedTokens?: { access_token: string; refresh_token: string };
}

/**
 * Cookie からユーザー ID を取得する。
 * null の場合は認証失敗。refreshedTokens がある場合はレスポンスに cookie をセットすること。
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (token) {
    const payload = await verifyJwt(token, authBaseUrl);
    if (payload) return sessionFromPayload(payload);
  }

  // アクセストークン期限切れ → リフレッシュ試行
  const refreshToken = cookieStore.get("refresh_token")?.value;
  if (refreshToken) {
    const refreshed = await deduplicatedRefresh(refreshToken);
    if (refreshed.kind === "ok") {
      const payload = await verifyJwt(refreshed.tokens.access_token, authBaseUrl);
      if (payload) return sessionFromPayload(payload, refreshed.tokens);
    }
    // refreshed.kind === "invalid" (恒久失敗) or "transient" (一時失敗) のいずれも null を返す。
    // Cookie 削除は me/route のみが担う（並行 refresh 競合で Cookie が消える問題を防ぐ）。
    return null;
  }

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
  return { session };
}

/** アクセストークン・リフレッシュトークン・token_exp を NextResponse の cookie にセットする共通処理 */
export function setTokenCookies(
  response: NextResponse,
  tokens: { access_token: string; refresh_token: string },
): void {
  response.cookies.set("access_token", tokens.access_token, { ...COOKIE_OPTS, maxAge: 900 });
  response.cookies.set("refresh_token", tokens.refresh_token, {
    ...COOKIE_OPTS,
    maxAge: 30 * 24 * 60 * 60,
  });
  // クライアントサイドからトークン有効期限を読めるよう non-HttpOnly で token_exp をセット
  const exp = getJwtExp(tokens.access_token);
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

/** リフレッシュされたトークンがある場合に NextResponse に cookie をセットする */
export function applyRefreshedTokens(response: NextResponse, session: AuthSession): NextResponse {
  if (session.refreshedTokens) {
    setTokenCookies(response, session.refreshedTokens);
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
  try {
    const response = await handler({ session: result.session, env, ctx });
    return applyRefreshedTokens(response, result.session);
  } catch (err) {
    // スタックトレースにシークレットが含まれるリスクを避けるため、メッセージのみをログに出力する
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error("[withSession] unhandled error:", name, message);
    return apiError("Internal Server Error", 500, { code: "INTERNAL_ERROR" });
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
  try {
    return { ok: true, data: (await request.json()) as T };
  } catch {
    return { ok: false, error: apiError("Invalid JSON", 400, { code: "INVALID_JSON" }) };
  }
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
  try {
    const response = await handler({ session: result.session, env, ctx });
    return applyRefreshedTokensToResponse(response, result.session);
  } catch (err) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error("[withBinarySession] unhandled error:", name, message);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * バイナリレスポンス（Response）にもリフレッシュ済みトークン Cookie をセットする。
 * image-proxy など NextResponse を使わないエンドポイント用。
 * NextResponse.cookies.set() を使うことでクッキー値の安全なシリアライズを保証する。
 */
export function applyRefreshedTokensToResponse(response: Response, session: AuthSession): Response {
  if (!session.refreshedTokens) return response;
  // NextResponse（Response のサブクラス）に変換して cookies.set() で安全にセット
  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  setTokenCookies(nextResponse, session.refreshedTokens);
  return nextResponse;
}
