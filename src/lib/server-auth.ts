import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyJwt, refreshTokens } from './auth';

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

/** BETA_ALLOWED_SUBS が設定されている場合、sub がリストに含まれるか確認 */
export function isBetaAllowed(sub: string): boolean {
  const list = process.env.BETA_ALLOWED_SUBS?.trim();
  if (!list) return true;
  return list.split(',').map((s) => s.trim()).includes(sub);
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
  const token = cookieStore.get('access_token')?.value;

  if (token) {
    const payload = await verifyJwt(token, authBaseUrl);
    if (payload) {
      if (!isBetaAllowed(payload.sub)) return null;
      return { userId: payload.sub };
    }
  }

  // アクセストークン期限切れ → リフレッシュ試行
  const refreshToken = cookieStore.get('refresh_token')?.value;
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
export async function requireSession(): Promise<{ session: AuthSession } | { error: NextResponse }> {
  const session = await getAuthSession();
  if (!session) {
    return { error: NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }) };
  }
  return { session };
}

/** リフレッシュされたトークンがある場合に NextResponse に cookie をセットする */
export function applyRefreshedTokens(
  response: NextResponse,
  session: AuthSession,
): NextResponse {
  if (session.refreshedTokens) {
    response.cookies.set('access_token', session.refreshedTokens.access_token, { ...COOKIE_OPTS, maxAge: 900 });
    response.cookies.set('refresh_token', session.refreshedTokens.refresh_token, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 });
  }
  return response;
}

/**
 * バイナリレスポンス（Response）にもリフレッシュ済みトークン Cookie をセットする。
 * image-proxy など NextResponse を使わないエンドポイント用。
 */
export function applyRefreshedTokensToResponse(
  response: Response,
  session: AuthSession,
): Response {
  if (!session.refreshedTokens) return response;
  const cookiePath = `; Path=/; HttpOnly; Secure; SameSite=Lax`;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', `access_token=${session.refreshedTokens.access_token}; Max-Age=900${cookiePath}`);
  headers.append('Set-Cookie', `refresh_token=${session.refreshedTokens.refresh_token}; Max-Age=${30 * 24 * 60 * 60}${cookiePath}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
