import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyJwt, refreshTokens } from "./auth";

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

/** BETA_ALLOWED_SUBS が設定されている場合、sub がリストに含まれるか確認 */
export function isBetaAllowed(sub: string): boolean {
  const list = process.env.BETA_ALLOWED_SUBS?.trim();
  if (!list) return true;
  return list.split(",").some((s) => s.trim() === sub);
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
    if (payload) {
      if (!isBetaAllowed(payload.sub)) return null;
      return { userId: payload.sub };
    }
  }

  // アクセストークン期限切れ → リフレッシュ試行
  const refreshToken = cookieStore.get("refresh_token")?.value;
  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed) {
      const payload = await verifyJwt(refreshed.access_token, authBaseUrl);
      if (payload) {
        if (!isBetaAllowed(payload.sub)) return null;
        return { userId: payload.sub, refreshedTokens: refreshed };
      }
    }
  }

  return null;
}

/** セッション取得 + 認証失敗時は 401 を返すヘルパー */
export async function requireSession(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const session = await getAuthSession();
  if (!session) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  return { session };
}

/** リフレッシュされたトークンがある場合に NextResponse に cookie をセットする */
export function applyRefreshedTokens(response: NextResponse, session: AuthSession): NextResponse {
  if (session.refreshedTokens) {
    response.cookies.set("access_token", session.refreshedTokens.access_token, {
      ...COOKIE_OPTS,
      maxAge: 900,
    });
    response.cookies.set("refresh_token", session.refreshedTokens.refresh_token, {
      ...COOKIE_OPTS,
      maxAge: 30 * 24 * 60 * 60,
    });
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
  handler: (params: {
    session: AuthSession;
    env: CloudflareEnv;
    ctx: ExecutionContext;
  }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const result = await requireSession();
  if ("error" in result) return result.error;
  const { env, ctx } = await getCloudflareContext({ async: true });
  const response = await handler({ session: result.session, env, ctx });
  return applyRefreshedTokens(response, result.session);
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
    return { ok: false, error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
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
  handler: (params: {
    session: AuthSession;
    env: CloudflareEnv;
    ctx: ExecutionContext;
  }) => Promise<Response>,
): Promise<Response> {
  const result = await requireSession();
  if ("error" in result) return result.error;
  const { env, ctx } = await getCloudflareContext({ async: true });
  const response = await handler({ session: result.session, env, ctx });
  return applyRefreshedTokensToResponse(response, result.session);
}

/**
 * バイナリレスポンス（Response）にもリフレッシュ済みトークン Cookie をセットする。
 * image-proxy など NextResponse を使わないエンドポイント用。
 */
export function applyRefreshedTokensToResponse(response: Response, session: AuthSession): Response {
  if (!session.refreshedTokens) return response;
  const cookiePath = `; Path=/; HttpOnly; Secure; SameSite=Lax`;
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `access_token=${session.refreshedTokens.access_token}; Max-Age=900${cookiePath}`,
  );
  headers.append(
    "Set-Cookie",
    `refresh_token=${session.refreshedTokens.refresh_token}; Max-Age=${30 * 24 * 60 * 60}${cookiePath}`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
