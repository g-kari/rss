import { NextRequest, NextResponse } from "next/server";
import { withJsonBody, requireString, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { readCache, writeCache } from "@/lib/recommendation";
import { MAX_ID_LENGTH, MAX_DISMISSED_IDS } from "@/lib/validation";

const DISMISS_COOLDOWN_MS = 2 * 1000; // 2秒

export async function POST(req: NextRequest) {
  return withJsonBody<{ id?: unknown }>(req, async ({ body, session, env }) => {
    const dismissId = requireString(body.id, MAX_ID_LENGTH);
    if (!dismissId) {
      return apiError("id is required", 400, { code: "INVALID_ID" });
    }

    const limited = await applyCooldown(
      env.RATE_LIMIT,
      `${session.userId}:dismiss-cooldown`,
      DISMISS_COOLDOWN_MS,
    );
    if (limited) return limited;

    const cache = await readCache(env.RSS_DATA, session.userId);
    if (!cache) {
      return NextResponse.json({ ok: true });
    }

    const dismissedIds = new Set(cache.dismissedIds);
    // 上限超過時は古い ID を削除して最新 ID のみ保持（FIFO）
    if (dismissedIds.size >= MAX_DISMISSED_IDS && !dismissedIds.has(dismissId)) {
      const [oldest] = dismissedIds;
      dismissedIds.delete(oldest);
    }
    dismissedIds.add(dismissId);

    const updated = {
      ...cache,
      recommendations: cache.recommendations.filter((r) => r.id !== dismissId),
      dismissedIds: [...dismissedIds],
    };

    await writeCache(env.RSS_DATA, session.userId, updated);
    return NextResponse.json({ ok: true });
  });
}
