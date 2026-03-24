import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJwt, exchangeCode } from '@/lib/auth';
import { r2Put } from '@/lib/r2';
import { isBetaAllowed, COOKIE_OPTS } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { UserProfile } from '@/types';

/**
 * 認証エラーレスポンスを生成し、auth_state クッキーを削除する。
 * 失敗後も同じ state での再試行を防ぐため、全エラーパスで削除する。
 */
function authError(message: string, status: number): Response {
  const cookieClear = `auth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(`<p>${message}</p>`, {
    status,
    headers: {
      'Content-Type': 'text/html',
      'Set-Cookie': cookieClear,
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const cookieStore = await cookies();
  const savedState = cookieStore.get('auth_state')?.value;

  // state は HttpOnly cookie で管理されており攻撃者は値を読めないため、
  // タイミング攻撃は非現実的。通常の文字列比較で十分。
  if (!code || !state || !savedState || state !== savedState) {
    return authError('認証エラー: state 不一致', 400);
  }

  const appBaseUrl = process.env.APP_BASE_URL!;
  const callbackUrl = `${appBaseUrl}/api/auth/callback`;
  const tokens = await exchangeCode(code, callbackUrl);
  if (!tokens) {
    return authError('認証エラー: トークン交換失敗', 401);
  }

  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const payload = await verifyJwt(tokens.access_token, authBaseUrl);
  const sub = payload?.sub ?? tokens.user.id;

  // ベータアクセス制限チェック
  if (!isBetaAllowed(sub)) {
    return NextResponse.redirect(new URL('/?beta=denied', request.url));
  }

  // プロフィールを R2 に保存
  const { env } = await getCloudflareContext({ async: true });
  const profile: UserProfile = {
    id: tokens.user.id,
    sub,
    email: tokens.user.email,
    name: tokens.user.name,
    picture: tokens.user.picture,
  };
  await r2Put(env.RSS_DATA, `users/${sub}/profile.json`, profile);

  const res = NextResponse.redirect(new URL('/', request.url));
  res.cookies.delete('auth_state');
  res.cookies.set('access_token', tokens.access_token, { ...COOKIE_OPTS, maxAge: 900 });
  res.cookies.set('refresh_token', tokens.refresh_token, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 });
  return res;
}
