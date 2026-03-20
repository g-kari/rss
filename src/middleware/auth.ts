import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, HonoEnv } from '../types';
import { verifyJwt, refreshTokens } from '../lib/auth';

/** BETA_ALLOWED_SUBS が設定されている場合、sub がリストに含まれるか確認 */
export function isBetaAllowed(sub: string, env: Env): boolean {
  const list = env.BETA_ALLOWED_SUBS?.trim();
  if (!list) return true; // 空 = 制限なし
  return list.split(',').map((s) => s.trim()).includes(sub);
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
};

export async function requireAuth(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  let userId: string | null = null;

  const token = getCookie(c, 'access_token');
  if (token) {
    const payload = await verifyJwt(token, c.env.AUTH_BASE_URL);
    if (payload) userId = payload.sub;
  }

  if (!userId) {
    const refreshToken = getCookie(c, 'refresh_token');
    if (refreshToken) {
      const refreshed = await refreshTokens(refreshToken, c.env);
      if (refreshed) {
        const payload = await verifyJwt(refreshed.access_token, c.env.AUTH_BASE_URL);
        if (payload) {
          userId = payload.sub;
          setCookie(c, 'access_token', refreshed.access_token, { ...COOKIE_OPTS, maxAge: 900 });
          setCookie(c, 'refresh_token', refreshed.refresh_token, {
            ...COOKIE_OPTS,
            maxAge: 30 * 24 * 60 * 60,
          });
        }
      }
      if (!userId) {
        deleteCookie(c, 'access_token', { path: '/' });
        deleteCookie(c, 'refresh_token', { path: '/' });
      }
    }
  }

  if (!userId) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  if (!isBetaAllowed(userId, c.env)) {
    return c.json({ error: { code: 'BETA_RESTRICTED', message: 'Beta access only' } }, 403);
  }

  c.set('userId', userId);
  await next();
}
