import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { PushConfig } from '@/types';

/** Push サブスクリプションを R2 から削除する */
export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = await getCloudflareContext({ async: true });

  const body = await request.json() as { endpoint?: string };
  if (!body?.endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  const key = `users/${session.userId}/push.json`;
  const config = await r2Get<PushConfig>(env.RSS_DATA, key, { subscriptions: [] });

  config.subscriptions = config.subscriptions.filter((s) => s.endpoint !== body.endpoint);
  await r2Put(env.RSS_DATA, key, config);

  return applyRefreshedTokens(NextResponse.json({ ok: true }), session);
}
