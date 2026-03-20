import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJwt, refreshTokens } from '@/lib/auth';
import { r2Get } from '@/lib/r2';
import { isBetaAllowed, COOKIE_OPTS } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { UserProfile } from '@/types';

export const runtime = 'edge';

export async function GET(request: Request) {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  const { env } = getCloudflareContext();

  // URL パラメーターでベータ制限リダイレクトを検出
  const url = new URL(request.url);
  if (url.searchParams.get('beta') === 'denied') {
    return NextResponse.json({ user: null, betaRestricted: true });
  }

  if (token) {
    const payload = await verifyJwt(token, authBaseUrl);
    if (payload) {
      if (!isBetaAllowed(payload.sub)) {
        return NextResponse.json({ user: null, betaRestricted: true });
      }
      const profile = await r2Get<UserProfile | null>(env.RSS_DATA, `users/${payload.sub}/profile.json`, null);
      return NextResponse.json({ user: profile });
    }
  }

  // アクセストークン期限切れ → リフレッシュ試行
  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed) {
      const payload = await verifyJwt(refreshed.access_token, authBaseUrl);
      if (payload) {
        if (!isBetaAllowed(payload.sub)) {
          return NextResponse.json({ user: null, betaRestricted: true });
        }
        const profile = await r2Get<UserProfile | null>(env.RSS_DATA, `users/${payload.sub}/profile.json`, null);
        const res = NextResponse.json({ user: profile });
        res.cookies.set('access_token', refreshed.access_token, { ...COOKIE_OPTS, maxAge: 900 });
        res.cookies.set('refresh_token', refreshed.refresh_token, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 });
        return res;
      }
    }
    const res = NextResponse.json({ user: null });
    res.cookies.delete('access_token');
    res.cookies.delete('refresh_token');
    return res;
  }

  return NextResponse.json({ user: null });
}
