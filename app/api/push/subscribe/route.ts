import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import type { PushConfig, PushSubscriptionRecord } from '@/types';

/** Push サブスクリプションあたりの上限数 */
const MAX_SUBSCRIPTIONS_PER_USER = 20;

/** base64url 形式かつ指定バイト範囲に収まるかを検証する */
function isValidBase64url(value: string, minBytes: number, maxBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+=*$/.test(value)) return false;
  // base64url の文字数からデコード後のバイト数を推定 (padding 除外)
  const stripped = value.replace(/=+$/, '');
  const decodedBytes = Math.floor((stripped.length * 3) / 4);
  return decodedBytes >= minBytes && decodedBytes <= maxBytes;
}

/** Push サブスクリプションを R2 に保存する */
export async function POST(request: Request) {
  return withSession(async ({ session, env }) => {
    const body = await request.json() as Partial<PushSubscriptionRecord>;

    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    // endpoint は HTTPS URL、かつ 2048 文字以内
    let endpointUrl: URL;
    try {
      endpointUrl = new URL(body.endpoint);
    } catch {
      return NextResponse.json({ error: 'Invalid endpoint URL' }, { status: 400 });
    }
    if (endpointUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'endpoint must be HTTPS' }, { status: 400 });
    }
    if (body.endpoint.length > 2048) {
      return NextResponse.json({ error: 'endpoint too long' }, { status: 400 });
    }

    // p256dh: 非圧縮 P-256 公開鍵 (65 bytes)、base64url
    if (!isValidBase64url(body.keys.p256dh, 60, 70)) {
      return NextResponse.json({ error: 'Invalid p256dh key' }, { status: 400 });
    }

    // auth: 認証シークレット (16 bytes)、base64url
    if (!isValidBase64url(body.keys.auth, 12, 20)) {
      return NextResponse.json({ error: 'Invalid auth key' }, { status: 400 });
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

    // サブスクリプション数の上限チェック
    if (config.subscriptions.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      return NextResponse.json({ error: 'Too many subscriptions' }, { status: 429 });
    }

    config.subscriptions.push(subscription);

    await r2Put(env.RSS_DATA, key, config);
    return NextResponse.json({ ok: true });
  });
}
