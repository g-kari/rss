import { NextResponse } from "next/server";
import { withJsonBody, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { pushSubscribeCooldownKey } from "@/lib/r2";
import { isValidHttpsUrl } from "@/lib/url";
import { isValidBase64url, MAX_SUBSCRIPTIONS_PER_USER } from "@/lib/validation";
import { updatePushConfig } from "@/lib/push-config";
import type { PushSubscriptionRecord } from "@/types";

const PUSH_SUBSCRIBE_COOLDOWN_MS = 5 * 1000;

/** Push サブスクリプションを R2 に保存する */
export async function POST(request: Request) {
  return withJsonBody<Partial<PushSubscriptionRecord>>(request, async ({ body, session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      pushSubscribeCooldownKey(session.userId),
      PUSH_SUBSCRIBE_COOLDOWN_MS,
    );
    if (limited) return limited;

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

    let tooMany = false;
    await updatePushConfig(env.RSS_DATA, session.userId, (config) => {
      const subscriptions = config.subscriptions.filter(
        (s) => s.endpoint !== subscription.endpoint,
      );
      tooMany = subscriptions.length >= MAX_SUBSCRIPTIONS_PER_USER;
      return tooMany ? config : { ...config, subscriptions: [...subscriptions, subscription] };
    });
    if (tooMany) return apiError("Too many subscriptions", 429, { code: "TOO_MANY_SUBSCRIPTIONS" });

    return NextResponse.json({ ok: true });
  });
}
