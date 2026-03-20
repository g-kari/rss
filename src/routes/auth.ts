import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { HonoEnv, UserProfile } from '../types';
import { verifyJwt, exchangeCode, revokeToken, refreshTokens } from '../lib/auth';
import { r2Get, r2Put } from '../lib/r2';
import { isBetaAllowed } from '../middleware/auth';

const app = new Hono<HonoEnv>();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
};

// GET /api/auth/login — 0g0 ID ログインへリダイレクト
app.get('/login', (c) => {
  const state = crypto.randomUUID();
  const callbackUrl = `${c.env.APP_BASE_URL}/api/auth/callback`;
  const loginUrl = new URL(`${c.env.AUTH_BASE_URL}/auth/login`);
  loginUrl.searchParams.set('redirect_to', callbackUrl);
  loginUrl.searchParams.set('state', state);

  setCookie(c, 'auth_state', state, { ...COOKIE_OPTS, maxAge: 600 });
  return c.redirect(loginUrl.toString());
});

// GET /api/auth/callback — コード交換 → cookie セット → / へリダイレクト
app.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const savedState = getCookie(c, 'auth_state');
  deleteCookie(c, 'auth_state', { path: '/' });

  if (!code || !state || state !== savedState) {
    return c.html('<p>認証エラー: state 不一致</p>', 400);
  }

  const callbackUrl = `${c.env.APP_BASE_URL}/api/auth/callback`;
  const tokens = await exchangeCode(code, callbackUrl, c.env);
  if (!tokens) {
    return c.html('<p>認証エラー: トークン交換失敗</p>', 401);
  }

  // JWT から sub を取得 (storage key)
  const payload = await verifyJwt(tokens.access_token, c.env.AUTH_BASE_URL);
  const sub = payload?.sub ?? tokens.user.id;

  // ベータアクセス制限チェック
  if (!isBetaAllowed(sub, c.env)) {
    return c.redirect('/?beta=denied');
  }

  // プロフィールを R2 に保存
  const profile: UserProfile = {
    id: tokens.user.id,
    sub,
    email: tokens.user.email,
    name: tokens.user.name,
    picture: tokens.user.picture,
  };
  await r2Put(c.env.RSS_DATA, `users/${sub}/profile.json`, profile);

  setCookie(c, 'access_token', tokens.access_token, { ...COOKIE_OPTS, maxAge: 900 });
  setCookie(c, 'refresh_token', tokens.refresh_token, {
    ...COOKIE_OPTS,
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.redirect('/');
});

// POST /api/auth/logout — トークン失効 + cookie クリア
app.post('/logout', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token');
  if (refreshToken) {
    await revokeToken(refreshToken, c.env).catch(() => {});
  }
  deleteCookie(c, 'access_token', { path: '/' });
  deleteCookie(c, 'refresh_token', { path: '/' });
  return c.json({ ok: true });
});

// GET /api/auth/me — 現在のユーザー情報
app.get('/me', async (c) => {
  const token = getCookie(c, 'access_token');

  if (token) {
    const payload = await verifyJwt(token, c.env.AUTH_BASE_URL);
    if (payload) {
      if (!isBetaAllowed(payload.sub, c.env)) {
        return c.json({ user: null, betaRestricted: true });
      }
      const profile = await r2Get<UserProfile | null>(
        c.env.RSS_DATA,
        `users/${payload.sub}/profile.json`,
        null
      );
      return c.json({ user: profile });
    }
  }

  // アクセストークン期限切れ → リフレッシュ試行
  const refreshToken = getCookie(c, 'refresh_token');
  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken, c.env);
    if (refreshed) {
      const payload = await verifyJwt(refreshed.access_token, c.env.AUTH_BASE_URL);
      if (payload) {
        if (!isBetaAllowed(payload.sub, c.env)) {
          return c.json({ user: null, betaRestricted: true });
        }
        setCookie(c, 'access_token', refreshed.access_token, { ...COOKIE_OPTS, maxAge: 900 });
        setCookie(c, 'refresh_token', refreshed.refresh_token, {
          ...COOKIE_OPTS,
          maxAge: 30 * 24 * 60 * 60,
        });
        const profile = await r2Get<UserProfile | null>(
          c.env.RSS_DATA,
          `users/${payload.sub}/profile.json`,
          null
        );
        return c.json({ user: profile });
      }
    }
    deleteCookie(c, 'access_token', { path: '/' });
    deleteCookie(c, 'refresh_token', { path: '/' });
  }

  return c.json({ user: null });
});

export default app;
