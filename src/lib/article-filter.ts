import type { Article, DateRange, ReadingTimeRange } from "../types";
import { type CompiledKeywordFilter, matchesKeywordFilter } from "./keyword-filter";
import { articleMatchesQuery, getDateRangeStart, readingTime } from "./article-utils";
import { SPECIAL_FEED_IDS } from "./storage";

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
function buildArticlePredicate(opts: ArticleFilterOptions): (a: Article) => boolean {
  const {
    feedId,
    feedFilterMap,
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    historyIds,
    unreadOnly,
    bookmarkOnly,
    readingListOnly,
    likeOnly,
    noteOnly,
    noteIds,
    query: rawQuery,
    dateRange,
    activeIds,
    nsfwMode,
    nsfwFeedIds,
    globalFilter,
    readBeforeTimestamp,
    snoozedUntil,
    readingTimeRange = "all",
    mutedFeedIds,
    authorFilter,
    categoryFilter,
    feedCategoryMap,
  } = opts;

  const q = rawQuery.trim().toLowerCase();
  const rangeStart = getDateRangeStart(dateRange);
  const now = snoozedUntil && Object.keys(snoozedUntil).length > 0 ? new Date().toISOString() : "";

  return (a: Article) => {
    // フィード絞り込み（アクティブな記事も対象）
    if (!matchesFeedId(a, feedId, bookmarkIds, readingListIds, likeIds, historyIds)) return false;

    // アクティブな記事はフィルター対象外（未読フィルター中でも前後ナビが消えないようにする）
    if (!activeIds.has(a.id)) {
      // スヌーズ中の記事は非表示
      if (snoozedUntil) {
        const until = snoozedUntil[a.id];
        if (until && until > now) return false;
      }
      // NSFW フィード — NSFW モードでなければ非表示
      if (!nsfwMode && nsfwFeedIds.has(a.feedHash)) return false;
      // ミュート中のフィード — 全フィード表示時のみ除外（特定フィード選択時は表示）
      if (!feedId && mutedFeedIds?.has(a.feedHash)) return false;
      // キーワードフィルター
      const kf = feedFilterMap.get(a.feedHash);
      if (kf && !matchesKeywordFilter(a, kf)) return false;
      if (globalFilter && !matchesKeywordFilter(a, globalFilter)) return false;
      // 各種絞り込みフィルター
      if (unreadOnly && isArticleRead(a, readIds, readBeforeTimestamp)) return false;
      if (bookmarkOnly && !bookmarkIds.has(a.id)) return false;
      if (readingListOnly && !readingListIds.has(a.id)) return false;
      if (likeOnly && !likeIds.has(a.id)) return false;
      if (noteOnly && !noteIds.has(a.id)) return false;
      if (authorFilter && a.author !== authorFilter) return false;
      // カテゴリフィルター — 全フィード表示時のみ適用（特定フィード選択時は表示）
      if (!feedId && categoryFilter && feedCategoryMap?.get(a.feedHash) !== categoryFilter)
        return false;
      if (!matchesReadingTimeRange(a, readingTimeRange)) return false;
    }

    // 検索クエリ（title・summary・author・categories を AND 検索）
    if (q && !articleMatchesQuery(a, q)) return false;
    // 日付範囲
    if (rangeStart && (!a.publishedAt || new Date(a.publishedAt) < rangeStart)) return false;

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
  if (opts.digestMode && !opts.feedId) {
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
