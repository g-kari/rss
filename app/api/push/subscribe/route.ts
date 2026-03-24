import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { PushConfig, PushSubscriptionRecord } from '@/types';

/** Push サブスクリプションを R2 に保存する */
export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = await getCloudflareContext({ async: true });

  const body = await request.json() as Partial<PushSubscriptionRecord>;

  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const subscription: PushSubscriptionRecord = {
    endpoint: body.endpoint,
    expirationTime: body.expirationTime ?? null,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
  };

  const key = `users/${session.userId}/push.json`;
  const config = await r2Get<PushConfig>(env.RSS_DATA, key, { subscriptions: [] });

  // endpoint で重複排除して追加
  config.subscriptions = config.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
  config.subscriptions.push(subscription);

  await r2Put(env.RSS_DATA, key, config);
  return applyRefreshedTokens(NextResponse.json({ ok: true }), session);
}
