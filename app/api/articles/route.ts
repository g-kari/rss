import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, savedArticlesKey } from "@/lib/r2";
import {
  getUserLatestArticles,
  readArticlePage,
  readLatestArticles,
  readUserSubscriptions,
} from "@/lib/shared-feed";
import type { Article } from "@/types";

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
      if (!subs.some((s) => s.feedHash === feedHash)) {
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      }
      return NextResponse.json(articles);
    }

    // デフォルト: 全購読フィードの latest.json + 手動保存記事をマージして返す
    const [feedArticles, savedArticles] = await Promise.all([
      getUserLatestArticles(env.RSS_DATA, session.userId),
      r2Get<Article[]>(env.RSS_DATA, savedArticlesKey(session.userId), []),
    ]);
    const all = [...savedArticles, ...feedArticles].sort((a, b) => {
      const at = new Date(a.publishedAt ?? a.createdAt).getTime();
      const bt = new Date(b.publishedAt ?? b.createdAt).getTime();
      return bt - at;
    });
    return NextResponse.json(all);
  });
}
