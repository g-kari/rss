import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, userPushKey } from "@/lib/r2";
import { isValidHttpsUrl } from "@/lib/url";
import { isValidBase64url } from "@/lib/validation";
import type { PushConfig, PushSubscriptionRecord } from "@/types";

/** Push サブスクリプションあたりの上限数 */
const MAX_SUBSCRIPTIONS_PER_USER = 20;

/** Push サブスクリプションを R2 に保存する */
export async function POST(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const parsed = await parseJsonBody<Partial<PushSubscriptionRecord>>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return apiError("Invalid subscription", 400, { code: "INVALID_SUBSCRIPTION" });
    }

    // endpoint は HTTPS URL、2048 文字以内、かつプライベート IP レンジ外（SSRF 対策）
    if (!isValidHttpsUrl(body.endpoint)) {
      return apiError("Invalid endpoint URL", 400, { code: "INVALID_ENDPOINT" });
    }

    // p256dh: 非圧縮 P-256 公開鍵 (65 bytes)、base64url
    if (!isValidBase64url(body.keys.p256dh, 60, 70)) {
      return apiError("Invalid p256dh key", 400, { code: "INVALID_P256DH" });
    }

    // auth: 認証シークレット (16 bytes)、base64url
    if (!isValidBase64url(body.keys.auth, 12, 20)) {
      return apiError("Invalid auth key", 400, { code: "INVALID_AUTH_KEY" });
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
      return apiError("Too many subscriptions", 429, { code: "TOO_MANY_SUBSCRIPTIONS" });
    }

    config.subscriptions.push(subscription);

    await r2Put(env.RSS_DATA, key, config);
    return NextResponse.json({ ok: true });
  });
}
