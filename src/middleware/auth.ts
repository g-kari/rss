import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { HonoEnv } from '../types';
import { verifyJwt, refreshTokens } from '../lib/auth';

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

  c.set('userId', userId);
  await next();
}
