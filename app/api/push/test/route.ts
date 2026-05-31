import { NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, userPushKey, pushTestCooldownKey } from "@/lib/r2";
import { sendPushToAll } from "@/lib/web-push";
import type { PushConfig } from "@/types";

const PUSH_TEST_COOLDOWN_MS = 30_000;

/** テスト Push 通知を送信する（デバッグ用） */
export async function POST(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      pushTestCooldownKey(session.userId),
      PUSH_TEST_COOLDOWN_MS,
    );
    if (limited) return limited;

    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
      return apiError("VAPID keys not configured", 503, {
        code: "VAPID_NOT_CONFIGURED",
        hint: "npx wrangler secret put VAPID_PUBLIC_KEY",
      });
    }

    const pushKey = userPushKey(session.userId);
    const config = await r2Get<PushConfig>(env.RSS_DATA, pushKey, { subscriptions: [] });

    if (config.subscriptions.length === 0) {
      return apiError("No subscriptions found for this user", 404, {
        code: "NO_SUBSCRIPTIONS",
      });
    }

    const payload = {
      title: "RSS Reader テスト通知",
      body: "プッシュ通知が正常に動作しています",
      url: "/",
    };

    const remaining = await sendPushToAll(config.subscriptions, payload);

    const sent = config.subscriptions.length;
    const expired = sent - remaining.length;

    // 期限切れサブスクリプションを削除
    if (expired > 0) {
      config.subscriptions = remaining;
      await r2Put(env.RSS_DATA, pushKey, config);
    }

    return NextResponse.json({ sent, expired, remaining: remaining.length });
  });
}
