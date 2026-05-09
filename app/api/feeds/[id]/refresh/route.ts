import { NextRequest, NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { apiError, assertValidFeedHash } from "@/lib/api-error";
import { fetchSingleFeed } from "@/cron/fetch";
import { singleFeedRefreshCooldownKey } from "@/lib/r2";

const SINGLE_FEED_COOLDOWN_MS = 30 * 1000; // 30秒

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  const validationErr = assertValidFeedHash(feedHash);
  if (validationErr) return validationErr;
  return withSession(req, async ({ session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      singleFeedRefreshCooldownKey(session.userId, feedHash),
      SINGLE_FEED_COOLDOWN_MS,
    );
    if (limited) return limited;
    const feed = await fetchSingleFeed(env, session.userId, feedHash);
    if (!feed) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });
    return NextResponse.json(feed);
  });
}
