import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, savedArticlesKey } from "@/lib/r2";
import {
  getUserLatestArticles,
  readArticlePage,
  readLatestArticles,
  readUserSubscriptions,
} from "@/lib/shared-feed";
import { applyKeywordFilter, matchesKeywordFilter } from "@/lib/keyword-filter";
import { compareByDateDesc } from "@/lib/article-utils";
import type { Article, KeywordFilter } from "@/types";

export async function GET(request: NextRequest) {
  return withSession(async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get("feed");
    const page = parseInt(searchParams.get("page") ?? "1", 10);

    // フィード指定: 購読チェックと記事取得を並列実行
    if (feedHash) {
      const fetchArticles =
        page >= 2
          ? readArticlePage(env.RSS_DATA, feedHash, page)
          : readLatestArticles(env.RSS_DATA, feedHash);
      const [subs, articles] = await Promise.all([
        readUserSubscriptions(env.RSS_DATA, session.userId),
        fetchArticles,
      ]);
      const sub = subs.find((s) => s.feedHash === feedHash);
      if (!sub) {
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      }
      return NextResponse.json(applyKeywordFilter(articles, sub.filter));
    }

    // デフォルト: 全購読フィードの latest.json + 手動保存記事をマージして返す
    const [subs, feedArticles, savedArticles] = await Promise.all([
      readUserSubscriptions(env.RSS_DATA, session.userId),
      getUserLatestArticles(env.RSS_DATA, session.userId),
      r2Get<Article[]>(env.RSS_DATA, savedArticlesKey(session.userId), []),
    ]);

    // フィードごとのキーワードフィルターを適用
    const filterMap = new Map<string, KeywordFilter>();
    for (const sub of subs) {
      if (sub.filter) filterMap.set(sub.feedHash, sub.filter);
    }
    const filteredFeedArticles = feedArticles.filter((a) => {
      const filter = filterMap.get(a.feedHash);
      return !filter || matchesKeywordFilter(a, filter);
    });

    const all = [...savedArticles, ...filteredFeedArticles].sort(compareByDateDesc);
    return NextResponse.json(all);
  });
}
