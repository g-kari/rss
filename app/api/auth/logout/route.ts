import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeToken } from '@/lib/auth';


export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (refreshToken) {
    await revokeToken(refreshToken).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('access_token');
  res.cookies.delete('refresh_token');
  return res;
}
