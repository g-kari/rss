import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { PushConfig } from '@/types';

/** 現在のユーザーの Push 設定状態を返す */
export async function GET() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = await getCloudflareContext({ async: true });

  const config = await r2Get<PushConfig>(
    env.RSS_DATA,
    `users/${session.userId}/push.json`,
    { subscriptions: [] },
  );

  return applyRefreshedTokens(
    NextResponse.json({ subscriptionCount: config.subscriptions.length }),
    session,
  );
}
