import { NextResponse } from 'next/server';

export const runtime = 'edge';

export function GET(request: Request) {
  const state = crypto.randomUUID();
  const appBaseUrl = process.env.APP_BASE_URL!;
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const callbackUrl = `${appBaseUrl}/api/auth/callback`;

  const loginUrl = new URL(`${authBaseUrl}/auth/login`);
  loginUrl.searchParams.set('redirect_to', callbackUrl);
  loginUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(loginUrl.toString());
  res.cookies.set('auth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
