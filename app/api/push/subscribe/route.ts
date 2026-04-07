import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put, userPushKey } from "@/lib/r2";
import { isValidHttpsUrl } from "@/lib/url";
import { isValidBase64url } from "@/lib/validation";
import type { PushConfig, PushSubscriptionRecord } from "@/types";

/** Push サブスクリプションあたりの上限数 */
const MAX_SUBSCRIPTIONS_PER_USER = 20;

/** Push サブスクリプションを R2 に保存する */
export async function POST(request: Request) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<Partial<PushSubscriptionRecord>>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // endpoint は HTTPS URL、2048 文字以内、かつプライベート IP レンジ外（SSRF 対策）
    if (!isValidHttpsUrl(body.endpoint)) {
      return NextResponse.json({ error: "Invalid endpoint URL" }, { status: 400 });
    }

    // p256dh: 非圧縮 P-256 公開鍵 (65 bytes)、base64url
    if (!isValidBase64url(body.keys.p256dh, 60, 70)) {
      return NextResponse.json({ error: "Invalid p256dh key" }, { status: 400 });
    }

    // auth: 認証シークレット (16 bytes)、base64url
    if (!isValidBase64url(body.keys.auth, 12, 20)) {
      return NextResponse.json({ error: "Invalid auth key" }, { status: 400 });
    }

    const subscription: PushSubscriptionRecord = {
      endpoint: body.endpoint,
      expirationTime: body.expirationTime ?? null,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    };

    const key = userPushKey(session.userId);
    const config = await r2Get<PushConfig>(env.RSS_DATA, key, { subscriptions: [] });

    // endpoint で重複排除して追加
    config.subscriptions = config.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);

    // サブスクリプション数の上限チェック
    if (config.subscriptions.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      return NextResponse.json({ error: "Too many subscriptions" }, { status: 429 });
    }

    config.subscriptions.push(subscription);

    await r2Put(env.RSS_DATA, key, config);
    return NextResponse.json({ ok: true });
  });
}
