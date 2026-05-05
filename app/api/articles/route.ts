import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, savedArticlesKey, readStateKey } from "@/lib/r2";
import {
  getUserLatestArticles,
  MAX_PAGES,
  readArticlePage,
  readFeedMeta,
  readLatestArticles,
  readUserSubscriptions,
} from "@/lib/shared-feed";
import { applyKeywordFilter, applyKeywordFilterMap, buildFilterMap } from "@/lib/keyword-filter";
import { compareByDateDesc } from "@/lib/article-utils";
import { buildProtectedIds, filterExpiredArticles } from "@/lib/article-ttl";
import { isValidFeedHash } from "@/lib/validation";
import type { Article, ReadState } from "@/types";

const DEFAULT_READ_STATE: ReadState = {
  readIds: [],
  bookmarkIds: [],
  readingListIds: [],
  likeIds: [],
};

export async function GET(request: NextRequest) {
  return withSession(request, async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get("feed");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const sinceParam = searchParams.get("since");
    // since はミリ秒 Unix タイムスタンプとして受け取る
    const sinceMs = sinceParam !== null ? parseInt(sinceParam, 10) : null;

    if (feedHash && !isValidFeedHash(feedHash)) {
      return apiError("Invalid feed", 400, { code: "INVALID_FEED" });
    }

    if (feedHash && (!Number.isInteger(page) || page < 1 || page > MAX_PAGES)) {
      return apiError("Invalid page", 400, { code: "INVALID_PAGE" });
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
        return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });
      }
      const protectedIds = buildProtectedIds(readState);
      const keywordFiltered = applyKeywordFilter(articles, sub.filter);
      const filtered =
        readState.ttlDays === 0
          ? keywordFiltered
          : filterExpiredArticles(keywordFiltered, protectedIds, readState.ttlDays ?? undefined);
      return NextResponse.json(filtered);
    }

    // デフォルト: 全購読フィードの latest.json + 手動保存記事をマージして返す
    // subscriptions.json は一度だけ読み、getUserLatestArticles に渡して再利用する
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);

    // since が指定された場合: lastFetchedAt が since より新しいフィードだけ読む（R2 GET 削減）
    const activeSubs =
      sinceMs !== null
        ? await (async () => {
            const metas = await Promise.all(
              subs.map((s) => readFeedMeta(env.RSS_DATA, s.feedHash)),
            );
            return subs.filter((_, i) => {
              const meta = metas[i];
              if (!meta?.lastFetchedAt) return false;
              return new Date(meta.lastFetchedAt).getTime() > sinceMs;
            });
          })()
        : subs;

    const [feedArticles, savedArticles, readState] = await Promise.all([
      getUserLatestArticles(env.RSS_DATA, session.userId, activeSubs),
      r2Get<Article[]>(env.RSS_DATA, savedArticlesKey(session.userId), []),
      r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), DEFAULT_READ_STATE),
    ]);

    // フィードごとのキーワードフィルターを適用（キーワードは小文字化済み）
    const filterMap = buildFilterMap(subs, (s) => s.feedHash);
    const filteredFeedArticles = applyKeywordFilterMap(feedArticles, filterMap);

    // TTL フィルタ: 保護対象（bookmark/readingList/like/snooze/notes）以外の古い記事を除外
    const protectedIds = buildProtectedIds(readState);
    const ttlFilteredArticles =
      readState.ttlDays === 0
        ? filteredFeedArticles
        : filterExpiredArticles(filteredFeedArticles, protectedIds, readState.ttlDays ?? undefined);

    // since が指定された場合はさらに publishedAt でフィルタして差分のみ返す
    const finalFeedArticles =
      sinceMs !== null
        ? ttlFilteredArticles.filter((a) => {
            if (!a.publishedAt) return false;
            return new Date(a.publishedAt).getTime() > sinceMs;
          })
        : ttlFilteredArticles;

    // since 指定時は手動保存記事もフィルタリングする
    const finalSavedArticles =
      sinceMs !== null
        ? savedArticles.filter((a) => {
            const ts = a.publishedAt ?? a.createdAt;
            return new Date(ts).getTime() > sinceMs;
          })
        : savedArticles;

    const all = [...finalSavedArticles, ...finalFeedArticles].sort(compareByDateDesc);
    return NextResponse.json(all);
  });
}
