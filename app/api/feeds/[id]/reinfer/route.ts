import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import {
  readUserSubscriptions,
  readFeedMeta,
  writeFeedMeta,
  assembleClientFeed,
} from "@/lib/shared-feed";
import { inferFeedFromUrl } from "@/lib/llm-feed-generator";
import { fetchSingleFeed } from "@/cron/fetch";

/**
 * POST /api/feeds/:id/reinfer
 * LLM CSS セレクタを再推論する。
 * 既存のセレクタを消去し、inferFeedFromUrl で新たに推論してから記事を再取得する。
 * LLM 生成フィード（isScraping === true）のみ対象。
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(async ({ session, env }) => {
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    const meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    if (!meta.cssSelectors) {
      return NextResponse.json(
        { error: "このフィードは LLM スクレイピングではありません" },
        { status: 400 },
      );
    }

    // 既存のセレクタを消去してから再推論
    delete meta.cssSelectors;
    const cookie = sub.requestCookie;
    const inferred = await inferFeedFromUrl(meta.url, env.AI, cookie);
    if (!inferred) {
      return NextResponse.json({ error: "セレクタの再推論に失敗しました" }, { status: 422 });
    }

    meta.cssSelectors = inferred.selectors;
    await writeFeedMeta(env.RSS_DATA, meta);

    // 新しいセレクタで記事を再取得
    const feed = await fetchSingleFeed(env, session.userId, feedHash);
    return NextResponse.json(feed ?? assembleClientFeed(meta, sub));
  });
}
