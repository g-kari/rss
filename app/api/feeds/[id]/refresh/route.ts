import { NextRequest, NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { apiError, assertValidFeedHash } from "@/lib/api-error";
import { assertFeedSubscribed } from "@/lib/api-feed-guard";
import { fetchSingleFeed } from "@/cron/fetch";
import { singleFeedRefreshCooldownKey } from "@/lib/r2";

const SINGLE_FEED_COOLDOWN_MS = 30 * 1000; // 30秒

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  const validationErr = assertValidFeedHash(feedHash);
  if (validationErr) return validationErr;
  return withSession(req, async ({ session, env }) => {
    // 購読チェック — 未購読フィードへの refresh は 404 で拒否。
    // canonical: `purge-content-cache/route.ts` (#691) / `reinfer/route.ts` / `feeds/[id]/route.ts`。
    // 認証チェックの直後 + cooldown KV 書き込みの前に置く理由:
    //   未購読 feedHash への refresh 試行が cooldown KV を消費すると、
    //   存在 probing のサイドチャネルに加え、被購読者の cooldown を意図的に
    //   食いつぶす攻撃ベクトルになり得るため。
    const guard = await assertFeedSubscribed(env.RSS_DATA, session.userId, feedHash);
    if (guard.err) return guard.err;

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
