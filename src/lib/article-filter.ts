import type { Article, DateRange, ReadingTimeRange } from "../types";
import { type CompiledKeywordFilter, matchesKeywordFilter } from "./keyword-filter";
import { getDateRangeStart, readingTime } from "./article-utils";
import { matchesAdvancedQuery, type SearchContext } from "./full-text-search";
import { SPECIAL_FEED_IDS } from "./storage";

/** 空の feedTitleByHash — feed: クエリ未対応時のデフォルト */
const EMPTY_FEED_TITLE_MAP: ReadonlyMap<string, string> = new Map();

/**
 * 記事が既読かどうかを判定する。
 * readIds に含まれる場合、または readBeforeTimestamp 以前に公開された場合は既読扱い。
 */
export function isArticleRead(
  article: Article,
  readIds: Set<string>,
  readBeforeTimestamp: string | null,
): boolean {
  if (readIds.has(article.id)) return true;
  if (!readBeforeTimestamp) return false;
  const ts = article.publishedAt ?? article.createdAt;
  return ts <= readBeforeTimestamp;
}

export interface ArticleFilterOptions {
  feedId: string | null;
  /** feedHash → CompiledKeywordFilter のマップ（呼び出し側で buildFilterMap を使って事前計算すること） */
  feedFilterMap: Map<string, CompiledKeywordFilter>;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  historyIds: Set<string>;
  historyOrder: string[];
  unreadOnly: boolean;
  bookmarkOnly: boolean;
  readingListOnly: boolean;
  likeOnly: boolean;
  noteOnly: boolean;
  noteIds: Set<string>;
  query: string;
  sortOrder: "newest" | "oldest";
  dateRange: DateRange;
  /** 現在選択中 or 直前まで選択していた記事ID（フィルタ対象外） */
  activeIds: Set<string>;
  nsfwMode: boolean;
  nsfwFeedIds: Set<string>;
  globalFilter: CompiledKeywordFilter | null;
  readBeforeTimestamp: string | null;
  /** スヌーズ中の記事 — articleId → スヌーズ解除予定時刻（ISO 8601） */
  snoozedUntil?: Record<string, string>;
  /** 読了時間フィルター（"all" = フィルタなし） */
  readingTimeRange?: ReadingTimeRange;
  /** ミュート中のフィード ID セット — 全フィード表示時のみ除外 */
  mutedFeedIds?: Set<string>;
  /** 著者フィルター — 設定時はその著者の記事のみ表示（アクティブな記事は除外しない） */
  authorFilter?: string | null;
  /** カテゴリフィルター — 設定時はそのカテゴリに属するフィードの記事のみ表示 */
  categoryFilter?: string | null;
  /** feedHash → カテゴリ名のマップ（categoryFilter と組み合わせて使用） */
  feedCategoryMap?: Map<string, string>;
  /** ダイジェストモード — 全フィード表示時にフィードごとの最大件数を制限する */
  digestMode?: boolean;
  /** グループ選択時の対象フィード ID セット — 設定時は feedHash が含まれる記事のみ表示 */
  groupFeedIds?: Set<string>;
  /** feedHash → フィード表示名のマップ — `feed:` クエリで使用（未指定時は feed: クエリは常にミス） */
  feedTitleByHash?: ReadonlyMap<string, string>;
}

/**
 * 記事の読了時間が指定の範囲に収まるかを判定する。
 * "all" の場合は常に true を返す（フィルタなし）。
 */
function matchesReadingTimeRange(article: Article, range: ReadingTimeRange): boolean {
  if (range === "all") return true;
  const mins = readingTime(article.content ?? article.summary);
  if (range === "short") return mins <= 5;
  if (range === "medium") return mins > 5 && mins <= 15;
  return mins > 15; // "long"
}

/**
 * 記事が指定の feedId（特殊フィード含む）に属するかを判定する。
 * feedId が null の場合（全フィード表示）は常に true を返す。
 */
function matchesFeedId(
  a: Article,
  feedId: string | null,
  bookmarkIds: Set<string>,
  readingListIds: Set<string>,
  likeIds: Set<string>,
  historyIds: Set<string>,
): boolean {
  if (feedId === SPECIAL_FEED_IDS.BOOKMARKS) return bookmarkIds.has(a.id);
  if (feedId === SPECIAL_FEED_IDS.READING_LIST) return readingListIds.has(a.id);
  if (feedId === SPECIAL_FEED_IDS.LIKES) return likeIds.has(a.id);
  if (feedId === SPECIAL_FEED_IDS.HISTORY) return historyIds.has(a.id);
  if (feedId) return a.feedHash === feedId;
  return true;
}

/**
 * フィルターオプションからフィルター述語を構築して返す。
 *
 * ## フィルター適用順
 * 1. feedId による絞り込み（特殊フィード BOOKMARKS / READING_LIST / LIKES / HISTORY に対応）
 * 2. スヌーズ中の記事を除外（activeIds に含まれる場合は例外）
 * 3. NSFW フィードの非表示（nsfwMode が false の場合）
 * 4. ミュート中のフィードを除外（全フィード表示時のみ）
 * 5. フィード別キーワードフィルター（feedFilterMap）
 * 6. グローバルキーワードフィルター（globalFilter）
 * 7. 未読のみ・ブックマークのみ・リーディングリストのみ・メモありのみフィルター
 * 8. 著者フィルター（authorFilter が設定されている場合、その著者の記事のみ）
 * 9. カテゴリフィルター（categoryFilter が設定されている場合、そのカテゴリのフィードの記事のみ）
 * 10. 読了時間フィルター（short: 5分以内 / medium: 5〜15分 / long: 15分超）
 * 11. 検索クエリ（title / summary / author / categories の AND 検索）
 * 12. 日付範囲
 *
 * ※ 2〜10 は activeIds に含まれる記事には適用しない（ナビゲーション中の記事が消えないようにするため）
 */
/** feedId フィルター述語（activeIds に関わらず常に適用） */
function buildFeedPredicate(opts: ArticleFilterOptions): (a: Article) => boolean {
  const { feedId, bookmarkIds, readingListIds, likeIds, historyIds, groupFeedIds } = opts;
  const feedMatcher = (a: Article) =>
    matchesFeedId(a, feedId, bookmarkIds, readingListIds, likeIds, historyIds);
  if (!feedId && groupFeedIds && groupFeedIds.size > 0) {
    return (a) => groupFeedIds.has(a.feedHash);
  }
  return feedMatcher;
}

/** スヌーズ述語（activeIds 外の記事にのみ適用） */
function buildSnoozePredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { snoozedUntil } = opts;
  if (!snoozedUntil || Object.keys(snoozedUntil).length === 0) return null;
  const now = new Date().toISOString();
  return (a) => {
    const until = snoozedUntil[a.id];
    return !(until && until > now);
  };
}

/** NSFW 述語（activeIds 外の記事にのみ適用） */
function buildNsfwPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { nsfwMode, nsfwFeedIds } = opts;
  if (nsfwMode) return null;
  return (a) => !nsfwFeedIds.has(a.feedHash);
}

/** ミュート済みフィード述語（全フィード表示時のみ・activeIds 外の記事にのみ適用） */
function buildMutedFeedPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { feedId, mutedFeedIds, groupFeedIds } = opts;
  // feedId 選択時 or グループ選択時は明示的に選んでいるためミュートを適用しない
  if (feedId || groupFeedIds?.size || !mutedFeedIds?.size) return null;
  return (a) => !mutedFeedIds.has(a.feedHash);
}

/** キーワードフィルター述語（activeIds 外の記事にのみ適用） */
function buildKeywordPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { feedFilterMap, globalFilter } = opts;
  if (!feedFilterMap.size && !globalFilter) return null;
  return (a) => {
    const kf = feedFilterMap.get(a.feedHash);
    if (kf && !matchesKeywordFilter(a, kf)) return false;
    if (globalFilter && !matchesKeywordFilter(a, globalFilter)) return false;
    return true;
  };
}

/** 既読/ブックマーク/リーディングリスト/いいね/メモ状態述語（activeIds 外の記事にのみ適用） */
function buildStatePredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const {
    feedId,
    unreadOnly,
    bookmarkOnly,
    readingListOnly,
    likeOnly,
    noteOnly,
    bookmarkIds,
    readingListIds,
    likeIds,
    noteIds,
    readIds,
    readBeforeTimestamp,
  } = opts;
  if (!unreadOnly && !bookmarkOnly && !readingListOnly && !likeOnly && !noteOnly) return null;
  return (a) => {
    if (
      unreadOnly &&
      feedId !== SPECIAL_FEED_IDS.HISTORY &&
      isArticleRead(a, readIds, readBeforeTimestamp)
    )
      return false;
    if (bookmarkOnly && !bookmarkIds.has(a.id)) return false;
    if (readingListOnly && !readingListIds.has(a.id)) return false;
    if (likeOnly && !likeIds.has(a.id)) return false;
    if (noteOnly && !noteIds.has(a.id)) return false;
    return true;
  };
}

/** 著者フィルター述語（activeIds 外の記事にのみ適用） */
function buildAuthorPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { authorFilter } = opts;
  if (!authorFilter) return null;
  return (a) => a.author === authorFilter;
}

/** カテゴリフィルター述語（全フィード表示時のみ・activeIds 外の記事にのみ適用） */
function buildCategoryPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { feedId, categoryFilter, feedCategoryMap } = opts;
  if (feedId || !categoryFilter) return null;
  return (a) => feedCategoryMap?.get(a.feedHash) === categoryFilter;
}

/** 読了時間フィルター述語（activeIds 外の記事にのみ適用） */
function buildReadingTimePredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { readingTimeRange = "all" } = opts;
  if (readingTimeRange === "all") return null;
  return (a) => matchesReadingTimeRange(a, readingTimeRange);
}

/** 検索クエリ述語（activeIds に関わらず常に適用） */
function buildQueryPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const q = opts.query.trim();
  if (!q) return null;
  const ctx: SearchContext = { feedTitleByHash: opts.feedTitleByHash ?? EMPTY_FEED_TITLE_MAP };
  return (a) => matchesAdvancedQuery(a, q, ctx);
}

/** 日付範囲述語（activeIds に関わらず常に適用） */
function buildDatePredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const rangeStart = getDateRangeStart(opts.dateRange);
  if (!rangeStart) return null;
  return (a) => !!(a.publishedAt && new Date(a.publishedAt) >= rangeStart);
}

/**
 * フィルターオプションからフィルター述語を構築して返す。
 *
 * ## フィルター適用順
 * 1. feedId による絞り込み（特殊フィード BOOKMARKS / READING_LIST / LIKES / HISTORY に対応）
 * 2. スヌーズ中の記事を除外（activeIds に含まれる場合は例外）
 * 3. NSFW フィードの非表示（nsfwMode が false の場合）
 * 4. ミュート中のフィードを除外（全フィード表示時のみ）
 * 5. フィード別キーワードフィルター（feedFilterMap）
 * 6. グローバルキーワードフィルター（globalFilter）
 * 7. 未読のみ・ブックマークのみ・リーディングリストのみ・メモありのみフィルター
 * 8. 著者フィルター（authorFilter が設定されている場合、その著者の記事のみ）
 * 9. カテゴリフィルター（categoryFilter が設定されている場合、そのカテゴリのフィードの記事のみ）
 * 10. 読了時間フィルター（short: 5分以内 / medium: 5〜15分 / long: 15分超）
 * 11. 検索クエリ（title / summary / author / categories の AND 検索）
 * 12. 日付範囲
 *
 * ※ 2〜10 は activeIds に含まれる記事には適用しない（ナビゲーション中の記事が消えないようにするため）
 */
function buildArticlePredicate(opts: ArticleFilterOptions): (a: Article) => boolean {
  const { activeIds } = opts;

  // activeIds に関わらず常に適用される述語
  const alwaysPredicates = [
    buildFeedPredicate(opts),
    buildQueryPredicate(opts),
    buildDatePredicate(opts),
  ].filter((p): p is (a: Article) => boolean => p !== null);

  // activeIds 外の記事にのみ適用される述語
  const conditionalPredicates = [
    buildSnoozePredicate(opts),
    buildNsfwPredicate(opts),
    buildMutedFeedPredicate(opts),
    buildKeywordPredicate(opts),
    buildStatePredicate(opts),
    buildAuthorPredicate(opts),
    buildCategoryPredicate(opts),
    buildReadingTimePredicate(opts),
  ].filter((p): p is (a: Article) => boolean => p !== null);

  return (a: Article) => {
    if (!alwaysPredicates.every((p) => p(a))) return false;
    if (!activeIds.has(a.id) && !conditionalPredicates.every((p) => p(a))) return false;
    return true;
  };
}

/**
 * 記事リストにフィルタリングとソートを適用して返す。
 *
 * ## ソート
 * - HISTORY フィード: `historyOrder` の配列インデックス順（viewedAt 降順）
 * - sortOrder === "oldest": リストを逆順にする（publishedAt 昇順）
 * - それ以外: articles の元の順序（fetchArticles で publishedAt 降順保証済み）
 *
 * @param articles - 全記事リスト（publishedAt 降順を期待）
 * @param opts - フィルター・ソート・表示オプション
 * @returns フィルター・ソート済みの記事リスト
 */
export function filterAndSortArticles(articles: Article[], opts: ArticleFilterOptions): Article[] {
  const list = articles.filter(buildArticlePredicate(opts));

  // 履歴モードは viewedAt 降順（最近閲覧順）で固定
  if (opts.feedId === SPECIAL_FEED_IDS.HISTORY) {
    const orderMap = new Map(opts.historyOrder.map((id, i) => [id, i]));
    list.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
  } else if (opts.sortOrder === "oldest") {
    list.reverse();
  }

  // ソート後に適用するため、newest 順で先頭 3 件 = 最新 3 件になる。
  // アクティブな記事（現在選択中・猶予期間中）はカウントから除外して常に表示する。
  // グループ選択中はユーザーが明示的にスコープを絞っているため digest は適用しない。
  if (opts.digestMode && !opts.feedId && !opts.groupFeedIds?.size) {
    const feedCount = new Map<string, number>();
    return list.filter((a) => {
      if (opts.activeIds.has(a.id)) return true;
      const count = feedCount.get(a.feedHash) ?? 0;
      if (count >= 3) return false;
      feedCount.set(a.feedHash, count + 1);
      return true;
    });
  }

  return list;
}
