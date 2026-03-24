import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';

/** VAPID 公開鍵をクライアントに返す。Push 購読開始時に必要。 */
export async function GET() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: 'Push notifications not configured' }, { status: 503 });
  }

  return applyRefreshedTokens(NextResponse.json({ publicKey }), session);
}
