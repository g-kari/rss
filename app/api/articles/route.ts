import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, savedArticlesKey, readStateKey } from "@/lib/r2";
import {
  getUserLatestArticles,
  MAX_PAGES,
  readArticlePage,
  readLatestArticles,
  readUserSubscriptions,
} from "@/lib/shared-feed";
import { applyKeywordFilter, applyKeywordFilterMap, buildFilterMap } from "@/lib/keyword-filter";
import { compareByDateDesc } from "@/lib/article-utils";
import { buildProtectedIds, filterExpiredArticles } from "@/lib/article-ttl";
import type { Article, ReadState } from "@/types";

const DEFAULT_READ_STATE: ReadState = {
  readIds: [],
  bookmarkIds: [],
  readingListIds: [],
  likeIds: [],
};

export async function GET(request: NextRequest) {
  return withSession(async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get("feed");
    const page = parseInt(searchParams.get("page") ?? "1", 10);

    if (feedHash && !/^[0-9a-f]{16}$/.test(feedHash)) {
      return NextResponse.json({ error: "Invalid feed" }, { status: 400 });
    }

    if (feedHash && (!Number.isInteger(page) || page < 1 || page > MAX_PAGES)) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

    // フィード指定: 購読チェックと記事取得を並列実行
    if (feedHash) {
      const fetchArticles =
        page >= 2
          ? readArticlePage(env.RSS_DATA, feedHash, page)
          : readLatestArticles(env.RSS_DATA, feedHash);
      const [subs, articles, readState] = await Promise.all([
        readUserSubscriptions(env.RSS_DATA, session.userId),
        fetchArticles,
        r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), DEFAULT_READ_STATE),
      ]);
      const sub = subs.find((s) => s.feedHash === feedHash);
      if (!sub) {
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      }
      const protectedIds = buildProtectedIds(readState);
      const filtered = filterExpiredArticles(
        applyKeywordFilter(articles, sub.filter),
        protectedIds,
      );
      return NextResponse.json(filtered);
    }

    // デフォルト: 全購読フィードの latest.json + 手動保存記事をマージして返す
    const [subs, feedArticles, savedArticles, readState] = await Promise.all([
      readUserSubscriptions(env.RSS_DATA, session.userId),
      getUserLatestArticles(env.RSS_DATA, session.userId),
      r2Get<Article[]>(env.RSS_DATA, savedArticlesKey(session.userId), []),
      r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), DEFAULT_READ_STATE),
    ]);

    // フィードごとのキーワードフィルターを適用（キーワードは小文字化済み）
    const filterMap = buildFilterMap(subs, (s) => s.feedHash);
    const filteredFeedArticles = applyKeywordFilterMap(feedArticles, filterMap);

    // TTL フィルタ: 保護対象（bookmark/readingList/like/snooze/notes）以外の古い記事を除外
    const protectedIds = buildProtectedIds(readState);
    const ttlFilteredArticles = filterExpiredArticles(filteredFeedArticles, protectedIds);

    const all = [...savedArticles, ...ttlFilteredArticles].sort(compareByDateDesc);
    return NextResponse.json(all);
  });
}
