import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, r2Put, userPushKey } from "@/lib/r2";
import { sendPushToAll } from "@/lib/web-push";
import type { PushConfig } from "@/types";

/** テスト Push 通知を送信する（デバッグ用） */
export async function POST() {
  return withSession(async ({ session, env }) => {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json(
        { error: "VAPID keys not configured", hint: "npx wrangler secret put VAPID_PUBLIC_KEY" },
        { status: 503 },
      );
    }

    const config = await r2Get<PushConfig>(env.RSS_DATA, userPushKey(session.userId), {
      subscriptions: [],
    });

    if (config.subscriptions.length === 0) {
      return NextResponse.json({ error: "No subscriptions found for this user" }, { status: 404 });
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
      await r2Put(env.RSS_DATA, userPushKey(session.userId), config);
    }

    return NextResponse.json({ sent, expired, remaining: remaining.length });
  });
}
