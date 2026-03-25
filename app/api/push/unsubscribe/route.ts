import { NextResponse } from 'next/server';
import { withSession, parseJsonBody } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import type { PushConfig } from '@/types';

/** Push サブスクリプションを R2 から削除する */
export async function POST(request: Request) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{ endpoint?: string }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    if (!body?.endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    const key = `users/${session.userId}/push.json`;
    const config = await r2Get<PushConfig>(env.RSS_DATA, key, { subscriptions: [] });

    config.subscriptions = config.subscriptions.filter((s) => s.endpoint !== body.endpoint);
    await r2Put(env.RSS_DATA, key, config);

    return NextResponse.json({ ok: true });
  });
}
