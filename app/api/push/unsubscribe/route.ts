import { NextResponse } from "next/server";
import { withJsonBody, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { pushSubscribeCooldownKey } from "@/lib/r2";
import { isValidHttpsUrl } from "@/lib/url";
import { removeExpiredPushSubscriptions } from "@/lib/push-config";

const PUSH_SUBSCRIBE_COOLDOWN_MS = 5 * 1000;

/** Push サブスクリプションを R2 から削除する */
export async function POST(request: Request) {
  return withJsonBody<{ endpoint?: string }>(request, async ({ body, session, env }) => {
    const limited = await applyCooldown(
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

    await removeExpiredPushSubscriptions(env.RSS_DATA, session.userId, [body.endpoint]);

    return NextResponse.json({ ok: true });
  });
}
