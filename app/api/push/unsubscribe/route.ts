import { NextResponse } from "next/server";
import { withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, userPushKey, pushSubscribeCooldownKey } from "@/lib/r2";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";
import { isValidHttpsUrl } from "@/lib/url";
import type { PushConfig } from "@/types";

const PUSH_SUBSCRIBE_COOLDOWN_MS = 5 * 1000;

/** Push サブスクリプションを R2 から削除する */
export async function POST(request: Request) {
  return withJsonBody<{ endpoint?: string }>(request, async ({ body, session, env }) => {
    const limited = await checkAndUpdateCooldown(
      env.RATE_LIMIT,
      pushSubscribeCooldownKey(session.userId),
      PUSH_SUBSCRIBE_COOLDOWN_MS,
    );
    if (limited) return limited;

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
