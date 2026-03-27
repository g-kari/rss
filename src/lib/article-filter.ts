import type { Article, DateRange, Feed } from "../types";
import { matchesKeywordFilter } from "./keyword-filter";
import { articleMatchesQuery, getDateRangeStart } from "./article-utils";

export interface ArticleFilterOptions {
  feedId: string | null;
  feeds: Feed[];
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  historyIds: Set<string>;
  historyOrder: string[];
  unreadOnly: boolean;
  bookmarkOnly: boolean;
  query: string;
  sortOrder: "newest" | "oldest";
  dateRange: DateRange;
  /** 現在選択中 or 直前まで選択していた記事ID（フィルタ対象外） */
  activeIds: Set<string>;
  nsfwMode: boolean;
  nsfwFeedIds: Set<string>;
}

/** フィードごとのキーワードフィルターマップを構築する（キーワードは小文字化済み） */
function buildFeedFilterMap(feeds: Feed[]): Map<string, NonNullable<Feed["filter"]>> {
  const map = new Map<string, NonNullable<Feed["filter"]>>();
  for (const f of feeds) {
    if (f.filter && (f.filter.include.length > 0 || f.filter.exclude.length > 0)) {
      map.set(f.id, {
        ...f.filter,
        include: f.filter.include.map((kw) => kw.toLowerCase()),
        exclude: f.filter.exclude.map((kw) => kw.toLowerCase()),
      });
    }
  }
  return map;
}

/** 記事リストをフィルタリング・ソートして返す純粋関数 */
export function filterAndSortArticles(articles: Article[], opts: ArticleFilterOptions): Article[] {
  const {
    feedId,
    feeds,
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    historyIds,
    historyOrder,
    unreadOnly,
    bookmarkOnly,
    query: rawQuery,
    sortOrder,
    dateRange,
    activeIds,
    nsfwMode,
    nsfwFeedIds,
  } = opts;

  const isActive = (id: string) => activeIds.has(id);
  const q = rawQuery.trim().toLowerCase();
  const rangeStart = getDateRangeStart(dateRange);
  const feedFilterMap = buildFeedFilterMap(feeds);

  let list = articles.filter((a) => {
    // フィード絞り込み
    if (feedId === "__bookmarks__") {
      if (!bookmarkIds.has(a.id)) return false;
    } else if (feedId === "__reading_list__") {
      if (!readingListIds.has(a.id)) return false;
    } else if (feedId === "__likes__") {
      if (!likeIds.has(a.id)) return false;
    } else if (feedId === "__history__") {
      if (!historyIds.has(a.id)) return false;
    } else if (feedId && a.feedHash !== feedId) return false;

    // NSFW フィード — NSFW モードでなければ非表示
    if (!nsfwMode && nsfwFeedIds.has(a.feedHash) && !isActive(a.id)) return false;

    // キーワードフィルター（アクティブな記事はフィルタ対象外）
    if (!isActive(a.id)) {
      const kf = feedFilterMap.get(a.feedHash);
      if (kf && !matchesKeywordFilter(a, kf)) return false;
    }

    // 未読フィルター（アクティブな記事は除外しない）
    if (unreadOnly && readIds.has(a.id) && !isActive(a.id)) return false;

    // ブックマークフィルター（アクティブな記事は除外しない）
    if (bookmarkOnly && !bookmarkIds.has(a.id) && !isActive(a.id)) return false;

    // 検索クエリ（title・summary・author・categories を AND 検索）
    if (q && !articleMatchesQuery(a, q)) return false;

    // 日付範囲
    if (rangeStart && (!a.publishedAt || new Date(a.publishedAt) < rangeStart)) return false;

    return true;
  });

  // 履歴モードは viewedAt 降順（最近閲覧順）で固定
  if (feedId === "__history__") {
    const orderMap = new Map(historyOrder.map((id, i) => [id, i]));
    list = [...list].sort(
      (a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity),
    );
  } else if (sortOrder === "oldest") {
    list = [...list].reverse();
  }

  return list;
}
