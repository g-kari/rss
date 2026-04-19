import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, userPushKey } from "@/lib/r2";
import { isValidHttpsUrl } from "@/lib/url";
import type { PushConfig } from "@/types";

/** Push サブスクリプションを R2 から削除する */
export async function POST(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const parsed = await parseJsonBody<{ endpoint?: string }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    if (!body?.endpoint) {
      return apiError("endpoint is required", 400, { code: "INVALID_ENDPOINT" });
    }
    if (!isValidHttpsUrl(body.endpoint)) {
      return apiError("Invalid endpoint URL", 400, { code: "INVALID_ENDPOINT" });
    }

    const key = userPushKey(session.userId);
    const config = await r2Get<PushConfig>(env.RSS_DATA, key, { subscriptions: [] });

    config.subscriptions = config.subscriptions.filter((s) => s.endpoint !== body.endpoint);
    await r2Put(env.RSS_DATA, key, config);

    return NextResponse.json({ ok: true });
  });
}
