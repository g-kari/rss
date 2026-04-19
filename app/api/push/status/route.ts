import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, userPushKey } from "@/lib/r2";
import type { PushConfig } from "@/types";

/** 現在のユーザーの Push 設定状態を返す */
export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const config = await r2Get<PushConfig>(env.RSS_DATA, userPushKey(session.userId), {
      subscriptions: [],
    });

    return NextResponse.json({ subscriptionCount: config.subscriptions.length });
  });
}
