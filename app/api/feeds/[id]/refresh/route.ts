import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { fetchSingleFeed } from "@/cron/fetch";
import { singleFeedRefreshCooldownKey } from "@/lib/r2";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";

const SINGLE_FEED_COOLDOWN_MS = 30 * 1000; // 30秒

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(async ({ session, env }) => {
    const limited = await checkAndUpdateCooldown(
      env.RSS_DATA,
      singleFeedRefreshCooldownKey(session.userId, feedHash),
      SINGLE_FEED_COOLDOWN_MS,
    );
    if (limited) return limited;
    const feed = await fetchSingleFeed(env, session.userId, feedHash);
    if (!feed) return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    return NextResponse.json(feed);
  });
}
