import type { Article, DateRange, ReadingTimeRange } from "../types";
import { type CompiledKeywordFilter, matchesKeywordFilter } from "./keyword-filter";
import { getDateRangeStart, readingTime } from "./article-utils";
import { compileSearchQuery, type SearchContext } from "./full-text-search";
import { SPECIAL_FEED_IDS } from "./storage";

/** 空の feedTitleByHash — feed: クエリ未対応時のデフォルト (`Object.freeze` で誤った write を runtime 検知) */
const EMPTY_FEED_TITLE_MAP = Object.freeze(new Map<string, string>()) as ReadonlyMap<
  string,
  string
>;

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
  if (!ts) return false;
  return Date.parse(ts) <= Date.parse(readBeforeTimestamp);
}

/** フィード構造・選択に関するフィルターオプション */
export interface FilterByStructureOptions {
  feedId: string | null;
  /** feedHash → CompiledKeywordFilter のマップ（呼び出し側で buildFilterMap を使って事前計算すること） */
  feedFilterMap: Map<string, CompiledKeywordFilter>;
  /** グループ選択時の対象フィード ID セット — 設定時は feedHash が含まれる記事のみ表示 */
  groupFeedIds?: Set<string>;
  /** feedHash → フィード表示名のマップ — `feed:` クエリで使用（未指定時は feed: クエリは常にミス） */
  feedTitleByHash?: ReadonlyMap<string, string>;
  /**
   * FeedView カテゴリタブに属するフィード ID セット（feedId/groupFeedIds 未選択時のみ適用）。
   * 設定時（空 Set を含む）はそのカテゴリに属するフィードの記事のみ表示。undefined なら従来通り全フィード。
   */
  viewFeedIds?: Set<string>;
}

/** 記事コンテンツフィルター（NSFW・ミュート・キーワード・検索クエリ等）のオプション */
export interface ArticleContentFilterOptions {
  nsfwMode: boolean;
  nsfwFeedIds: Set<string>;
  globalFilter: CompiledKeywordFilter | null;
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
  /** 選択中のユーザータグ（そのタグが付いた記事のみ表示。null = フィルタなし） */
  selectedTag?: string | null;
  /** articleId → タグ配列マップ（selectedTag の判定に使用） */
  articleTags?: Record<string, string[]>;
  /** タグ付き記事のみ表示（タグ名は問わない） */
  taggedOnly?: boolean;
  /** コレクション選択時の対象記事 ID セット — 設定時はそのコレクション内の記事のみ表示 */
  collectionArticleIds?: Set<string>;
  /**
   * 記事の読了時間を返すメモ化付き関数 (#685)。
   * 未指定時は `readingTime()` を毎回実行する (パフォーマンス劣化注意)。
   * `createReadingTimeCache()` で生成し、articles 配列の reference 変化時に再生成する。
   */
  readingTimeCache?: (article: Article) => number;
}

/** 記事状態フィルター（既読・ブックマーク・リーディングリスト等）に関するクエリオプション */
export interface ArticleStateQueryOptions {
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
  readBeforeTimestamp: string | null;
}

/** 検索・日付・ソート等の表示オプション */
export interface ArticleDisplayOptions {
  query: string;
  sortOrder: "newest" | "oldest";
  dateRange: DateRange;
  /** 現在選択中 or 直前まで選択していた記事ID（フィルタ対象外） */
  activeIds: Set<string>;
  /** ダイジェストモード — 全フィード表示時にフィードごとの最大件数を制限する */
  digestMode?: boolean;
  /** feedHash → ダイジェスト表示件数のマップ（0 = 全件, undefined = デフォルト 3） */
  digestLimitMap?: Map<string, number>;
  /** digestMode 時のフィードスコア順リスト（高スコア順 feedHash[]） */
  feedEngagementOrder?: string[];
}

export interface ArticleFilterOptions
  extends
    FilterByStructureOptions,
    ArticleContentFilterOptions,
    ArticleStateQueryOptions,
    ArticleDisplayOptions {}

/**
 * 記事の読了時間が指定の範囲に収まるかを判定する。
 * "all" の場合は常に true を返す（フィルタなし）。
 *
 * #685: `getMins` を渡せばメモ化付きキャッシュ (`createReadingTimeCache`) を経由する。
 * 渡さない場合は毎回 `readingTime()` を実行するため、フィルター呼出のたびに stripHtml が
 * 8 回 regex pass を走らせる重い処理になる (大量記事で 150-400ms ラグ)。
 */
function matchesReadingTimeRange(
  article: Article,
  range: ReadingTimeRange,
  getMins?: (article: Article) => number,
): boolean {
  if (range === "all") return true;
  const mins = getMins ? getMins(article) : readingTime(article.content ?? article.summary);
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
  if (feedId === SPECIAL_FEED_IDS.DIGEST) return true;
  if (feedId) return a.feedHash === feedId;
  return true;
}

/** feedId フィルター述語（activeIds に関わらず常に適用） */
function buildFeedPredicate(opts: ArticleFilterOptions): (a: Article) => boolean {
  const { feedId, bookmarkIds, readingListIds, likeIds, historyIds, groupFeedIds, viewFeedIds } =
    opts;
  const feedMatcher = (a: Article) =>
    matchesFeedId(a, feedId, bookmarkIds, readingListIds, likeIds, historyIds);
  if (!feedId) {
    if (groupFeedIds && groupFeedIds.size > 0) {
      return (a) => groupFeedIds.has(a.feedHash);
    }
    // viewFeedIds が設定されていれば（空 Set 含む）カテゴリ横断表示モード。
    // 空 Set のときは該当フィードなしを明示するため全除外する。
    if (viewFeedIds) {
      return (a) => viewFeedIds.has(a.feedHash);
    }
  }
  return feedMatcher;
}

/** スヌーズ述語（activeIds 外の記事にのみ適用） */
function buildSnoozePredicate(
  opts: ArticleFilterOptions,
  now: string,
): ((a: Article) => boolean) | null {
  const { snoozedUntil } = opts;
  if (!snoozedUntil) return null;
  let hasAny = false;
  for (const _k in snoozedUntil) {
    hasAny = true;
    break;
  }
  if (!hasAny) return null;
  // ISO 8601 文字列の lexicographic 比較は timezone offset 形式 (`+09:00` 等) で
  // 同 absolute moment でも `+` (43) vs `Z` (90) で誤判定する罠を防ぐため、
  // canonical (`read-state-merge.ts#isLaterIso` / `read-state-prune.ts` /
  // `useFilteredArticles.ts` 44th cycle Date.parse 化) と揃えて Date.parse 化。
  const nowMs = Date.parse(now);
  return (a) => {
    const until = snoozedUntil[a.id];
    if (!until) return true;
    const untilMs = Date.parse(until);
    if (isNaN(untilMs)) return true; // 不正 ISO は guard で表示扱い
    return untilMs <= nowMs;
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
function buildStatePredicate(opts: StateFilterOptions): ((a: Article) => boolean) | null {
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

/** 選択中タグ / タグ有無によるフィルター */
function buildTagPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { selectedTag, articleTags, taggedOnly } = opts;
  if (!selectedTag && !taggedOnly) return null;
  const tags = articleTags ?? {};
  return (a) => {
    const arr = tags[a.id];
    if (!arr || arr.length === 0) return false;
    if (selectedTag && !arr.includes(selectedTag)) return false;
    return true;
  };
}

function buildCollectionPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const { collectionArticleIds } = opts;
  if (!collectionArticleIds) return null;
  return (a) => collectionArticleIds.has(a.id);
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
  const getMins = opts.readingTimeCache;
  return (a) => matchesReadingTimeRange(a, readingTimeRange, getMins);
}

/** 検索クエリ述語（activeIds に関わらず常に適用） */
function buildQueryPredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  // perf: AST を 1 度だけパースして bind した evaluator を返す。
  // matchesAdvancedQuery を per-article で呼ぶと parseSearchQuery が
  // 記事数分 (1000+ 件) 実行されてフィルタリング体感ラグの原因になる。
  const evaluator = compileSearchQuery(opts.query);
  if (!evaluator) return null;
  const ctx: SearchContext = { feedTitleByHash: opts.feedTitleByHash ?? EMPTY_FEED_TITLE_MAP };
  return (a) => evaluator(a, ctx);
}

/** 日付範囲述語（activeIds に関わらず常に適用） */
function buildDatePredicate(opts: ArticleFilterOptions): ((a: Article) => boolean) | null {
  const rangeStart = getDateRangeStart(opts.dateRange);
  if (!rangeStart) return null;
  return (a) => !!(a.publishedAt && new Date(a.publishedAt) >= rangeStart);
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

export interface StateFilterOptions {
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  unreadOnly: boolean;
  bookmarkOnly: boolean;
  readingListOnly: boolean;
  likeOnly: boolean;
  noteOnly: boolean;
  noteIds: Set<string>;
  sortOrder: "newest" | "oldest";
  activeIds: Set<string>;
  readBeforeTimestamp: string | null;
  historyOrder: string[];
  digestMode?: boolean;
  groupFeedIds?: Set<string>;
  /** feedHash → ダイジェスト表示件数のマップ（0 = 全件, undefined = デフォルト 3） */
  digestLimitMap?: Map<string, number>;
  /** digestMode 時のフィードスコア順リスト（高スコア順 feedHash[]） */
  feedEngagementOrder?: string[];
}

export function filterByStructure(articles: Article[], opts: ArticleFilterOptions): Article[] {
  const { activeIds } = opts;

  const alwaysPredicates = [
    buildFeedPredicate(opts),
    buildQueryPredicate(opts),
    buildDatePredicate(opts),
    buildCollectionPredicate(opts),
  ].filter((p): p is (a: Article) => boolean => p !== null);

  const now = new Date().toISOString();
  const conditionalPredicates = [
    buildSnoozePredicate(opts, now),
    buildNsfwPredicate(opts),
    buildMutedFeedPredicate(opts),
    buildKeywordPredicate(opts),
    buildTagPredicate(opts),
    buildAuthorPredicate(opts),
    buildCategoryPredicate(opts),
    buildReadingTimePredicate(opts),
  ].filter((p): p is (a: Article) => boolean => p !== null);

  return articles.filter((a) => {
    if (!alwaysPredicates.every((p) => p(a))) return false;
    if (!activeIds.has(a.id) && !conditionalPredicates.every((p) => p(a))) return false;
    return true;
  });
}

export function applyStateFilterAndSort(articles: Article[], opts: StateFilterOptions): Article[] {
  const { activeIds } = opts;
  const statePredicate = buildStatePredicate(opts);

  const needsSort = opts.feedId === SPECIAL_FEED_IDS.HISTORY || opts.sortOrder === "oldest";
  const isDigestFeed = opts.feedId === SPECIAL_FEED_IDS.DIGEST;
  const needsDigest = !!(
    (opts.digestMode || isDigestFeed) &&
    (!opts.feedId || isDigestFeed) &&
    !opts.groupFeedIds?.size
  );

  let list: Article[];
  if (statePredicate) {
    list = articles.filter((a) => activeIds.has(a.id) || statePredicate(a));
  } else if (needsSort || needsDigest) {
    list = articles.slice();
  } else {
    return articles;
  }

  if (opts.feedId === SPECIAL_FEED_IDS.HISTORY) {
    const orderMap = new Map(opts.historyOrder.map((id, i) => [id, i]));
    list.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
  } else if (opts.sortOrder === "oldest") {
    list.reverse();
  }

  if (needsDigest) {
    if (opts.feedEngagementOrder && opts.feedEngagementOrder.length > 0) {
      const orderIndex = new Map(opts.feedEngagementOrder.map((fh, i) => [fh, i]));
      list.sort((a, b) => {
        const ai = orderIndex.get(a.feedHash) ?? Infinity;
        const bi = orderIndex.get(b.feedHash) ?? Infinity;
        return ai !== bi ? ai - bi : 0;
      });
    }
    // #620 Option A: ダイジェスト時、既読記事は digestLimit カウントから除外する。
    // これにより既読消化が進むと「既読は全件表示 + 未読が常に digestLimit 件確保」となり、
    // 同一フィード内の既読を踏破した後は他フィードの未読が表示される。
    const feedCount = new Map<string, number>();
    return list.filter((a) => {
      if (activeIds.has(a.id)) return true;
      const isRead = isArticleRead(a, opts.readIds, opts.readBeforeTimestamp);
      // 既読は count を増やさず常に通過させる（digestLimit を超えても表示する）
      if (isRead) return true;
      const limit = opts.digestLimitMap?.get(a.feedHash);
      const effectiveLimit = limit === undefined ? 3 : limit === 0 ? Infinity : limit;
      const count = feedCount.get(a.feedHash) ?? 0;
      if (count >= effectiveLimit) return false;
      feedCount.set(a.feedHash, count + 1);
      return true;
    });
  }

  return list;
}

export function filterAndSortArticles(articles: Article[], opts: ArticleFilterOptions): Article[] {
  return applyStateFilterAndSort(filterByStructure(articles, opts), opts);
}
