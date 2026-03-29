import type { Article, DateRange, Feed, KeywordFilter } from "../types";
import { buildFilterMap, matchesKeywordFilter, normalizeFilter } from "./keyword-filter";
import { articleMatchesQuery, getDateRangeStart } from "./article-utils";
import { SPECIAL_FEED_IDS } from "./storage";

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
  readingListOnly: boolean;
  query: string;
  sortOrder: "newest" | "oldest";
  dateRange: DateRange;
  /** 現在選択中 or 直前まで選択していた記事ID（フィルタ対象外） */
  activeIds: Set<string>;
  nsfwMode: boolean;
  nsfwFeedIds: Set<string>;
  globalFilter: KeywordFilter | null;
}

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
    readingListOnly,
    query: rawQuery,
    sortOrder,
    dateRange,
    activeIds,
    nsfwMode,
    nsfwFeedIds,
    globalFilter,
  } = opts;

  const isActive = (id: string) => activeIds.has(id);
  const q = rawQuery.trim().toLowerCase();
  const rangeStart = getDateRangeStart(dateRange);
  const feedFilterMap = buildFilterMap(feeds, (f) => f.id);
  const normalizedGlobalFilter = globalFilter ? normalizeFilter(globalFilter) : null;

  let list = articles.filter((a) => {
    // フィード絞り込み
    if (feedId === SPECIAL_FEED_IDS.BOOKMARKS) {
      if (!bookmarkIds.has(a.id)) return false;
    } else if (feedId === SPECIAL_FEED_IDS.READING_LIST) {
      if (!readingListIds.has(a.id)) return false;
    } else if (feedId === SPECIAL_FEED_IDS.LIKES) {
      if (!likeIds.has(a.id)) return false;
    } else if (feedId === SPECIAL_FEED_IDS.HISTORY) {
      if (!historyIds.has(a.id)) return false;
    } else if (feedId && a.feedHash !== feedId) return false;

    // NSFW フィード — NSFW モードでなければ非表示
    if (!nsfwMode && nsfwFeedIds.has(a.feedHash) && !isActive(a.id)) return false;

    // キーワードフィルター（アクティブな記事はフィルタ対象外）
    if (!isActive(a.id)) {
      const kf = feedFilterMap.get(a.feedHash);
      if (kf && !matchesKeywordFilter(a, kf)) return false;
      if (normalizedGlobalFilter && !matchesKeywordFilter(a, normalizedGlobalFilter)) return false;
    }

    // 未読フィルター（アクティブな記事は除外しない）
    if (unreadOnly && readIds.has(a.id) && !isActive(a.id)) return false;

    // ブックマークフィルター（アクティブな記事は除外しない）
    if (bookmarkOnly && !bookmarkIds.has(a.id) && !isActive(a.id)) return false;

    // リーディングリストフィルター（アクティブな記事は除外しない）
    if (readingListOnly && !readingListIds.has(a.id) && !isActive(a.id)) return false;

    // 検索クエリ（title・summary・author・categories を AND 検索）
    if (q && !articleMatchesQuery(a, q)) return false;

    // 日付範囲
    if (rangeStart && (!a.publishedAt || new Date(a.publishedAt) < rangeStart)) return false;

    return true;
  });

  // 履歴モードは viewedAt 降順（最近閲覧順）で固定
  if (feedId === SPECIAL_FEED_IDS.HISTORY) {
    const orderMap = new Map(historyOrder.map((id, i) => [id, i]));
    list = [...list].sort(
      (a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity),
    );
  } else if (sortOrder === "oldest") {
    list = [...list].reverse();
  }

  return list;
}
