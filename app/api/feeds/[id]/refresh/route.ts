import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { fetchSingleFeed } from "@/cron/fetch";
import { r2Get, r2Put, singleFeedRefreshCooldownKey } from "@/lib/r2";

const SINGLE_FEED_COOLDOWN_MS = 30 * 1000; // 30秒

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(async ({ session, env }) => {
    const key = singleFeedRefreshCooldownKey(session.userId, feedHash);
    const { ts } = await r2Get<{ ts: number }>(env.RSS_DATA, key, { ts: 0 });
    const elapsed = Date.now() - ts;
    if (elapsed < SINGLE_FEED_COOLDOWN_MS) {
      const retryAfter = Math.ceil((SINGLE_FEED_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    await r2Put(env.RSS_DATA, key, { ts: Date.now() });

    const feed = await fetchSingleFeed(env, session.userId, feedHash);
    if (!feed) return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    return NextResponse.json(feed);
  });
}
