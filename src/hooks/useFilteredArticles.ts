import { useState, useMemo, useRef, useCallback } from "react";
import type { Article, Feed, FeedView, KeywordFilter } from "../types";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { useGracePeriod } from "./useGracePeriod";
import { filterByStructure, applyStateFilterAndSort } from "../lib/article-filter";
import { createReadingTimeCache } from "../lib/article-utils";
import { buildFilterMap, normalizeFilter, type CompiledKeywordFilter } from "../lib/keyword-filter";
import { useArticleFilters } from "./useArticleFilters";
import { useArticleSorting } from "./useArticleSorting";
import { useArticlePagination } from "./useArticlePagination";

// Object.freeze で sentinel が下流で .add() / .push() されても runtime throw する safety net。
// useDelayedGalleryItems.ts の EMPTY_SET と同じ pattern。
const EMPTY_SET = Object.freeze(new Set<string>()) as Set<string>;
const EMPTY_STR_ARRAY = Object.freeze([] as string[]) as string[];
const EMPTY_FEED_ARRAY = Object.freeze([] as Feed[]) as Feed[];

/** フィード選択に関する状態 */
export interface FeedSelectionOptions {
  feedId: string | null;
  groupFeedIds?: Set<string>;
  activeFeedView?: FeedView;
  selectedGroupId?: string | null;
}

/** 既読・保存状態 */
export interface ReadStateOptions {
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds?: Set<string>;
  readBeforeTimestamp?: string | null;
  snoozedUntil?: Record<string, string>;
  historyIds?: Set<string>;
  historyOrder?: string[];
  notes?: Record<string, string>;
}

/** コンテンツフィルタリング */
export interface ContentFilterOptions {
  nsfwMode?: boolean;
  nsfwFeedIds?: Set<string>;
  mutedFeedIds?: Set<string>;
  globalFilter: KeywordFilter | null;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
}

/** UI 状態 */
export interface UiOptions {
  selectedArticleId?: string | null;
  galleryAutoReadIds?: Set<string>;
  deduplicateByLink?: boolean;
  articleTags?: Record<string, string[]>;
  selectedTag?: string | null;
  collectionArticleIds?: Set<string>;
}

interface Options extends FeedSelectionOptions, ReadStateOptions, ContentFilterOptions, UiOptions {
  articles: Article[];
  feeds?: Feed[];
  feedEngagementOrder?: string[];
}

export function useFilteredArticles({
  articles,
  feeds = EMPTY_FEED_ARRAY,
  feedId,
  readIds,
  bookmarkIds,
  readingListIds,
  likeIds = EMPTY_SET,
  historyIds = EMPTY_SET,
  historyOrder = EMPTY_STR_ARRAY,
  selectedArticleId,
  nsfwMode = false,
  nsfwFeedIds = EMPTY_SET,
  globalFilter,
  setGlobalFilter,
  readBeforeTimestamp = null,
  snoozedUntil,
  mutedFeedIds,
  notes,
  groupFeedIds,
  selectedGroupId = null,
  activeFeedView,
  articleTags,
  selectedTag = null,
  collectionArticleIds,
  galleryAutoReadIds,
  deduplicateByLink = true,
  feedEngagementOrder,
}: Options) {
  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);

  const filters = useArticleFilters({ feedId, selectedGroupId, resetPage, activeFeedView });
  const { sortOrder, toggleSortOrder } = useArticleSorting(resetPage, activeFeedView);

  const {
    unreadOnly,
    bookmarkOnly,
    readingListOnly,
    likeOnly,
    noteOnly,
    digestMode,
    dateRange,
    readingTimeRange,
    query,
    authorFilter,
    categoryFilter,
  } = filters;

  const gracePeriodId = useGracePeriod(selectedArticleId);

  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedArticleId) ids.add(selectedArticleId);
    if (gracePeriodId) ids.add(gracePeriodId);
    if (galleryAutoReadIds) {
      for (const id of galleryAutoReadIds) ids.add(id);
    }
    return ids;
  }, [selectedArticleId, gracePeriodId, galleryAutoReadIds]);

  // activeIdsRef: structuralFiltered の useMemo は galleryAutoReadIds の高頻度変化で再計算を避けるため
  // activeIds を依存配列に含めず ref 経由でアクセスする（useSyncedRef とは目的が異なる意図的な最適化）。
  // filtered の useMemo では selectedArticleId / gracePeriodId を deps に明示してカバーしている。
  const activeIdsRef = useRef(activeIds);
  activeIdsRef.current = activeIds;

  const noteIds = useMemo(() => {
    const keys = Object.keys(notes ?? {});
    return keys.length > 0 ? new Set(keys) : EMPTY_SET;
  }, [notes]);

  const filterCompileCacheRef = useRef<Map<string, CompiledKeywordFilter>>(new Map());

  const feedFilterMap = useMemo(
    () => buildFilterMap(feeds, (f) => f.id, filterCompileCacheRef.current),
    [feeds],
  );
  const feedCategoryMap = useMemo(
    () =>
      new Map(feeds.filter((f) => f.category).map((f) => [f.id, f.category!] as [string, string])),
    [feeds],
  );
  const feedTitleByHash = useMemo(
    () => new Map(feeds.map((f) => [f.id, f.title] as [string, string])),
    [feeds],
  );
  const digestLimitMap = useMemo(
    () =>
      new Map(
        feeds
          .filter((f) => f.digestLimit !== undefined)
          .map((f) => [f.id, f.digestLimit!] as [string, number]),
      ),
    [feeds],
  );
  const viewFeedIds = useMemo(() => {
    if (!activeFeedView) return undefined;
    const ids = new Set<string>();
    for (const f of feeds) {
      const matched =
        activeFeedView === "articles"
          ? !f.view || f.view === "articles"
          : f.view === activeFeedView;
      if (matched) ids.add(f.id);
    }
    return ids;
  }, [feeds, activeFeedView]);
  const normalizedGlobalFilter = useMemo(
    () => (globalFilter ? normalizeFilter(globalFilter) : null),
    [globalFilter],
  );

  // #685: 読了時間フィルター用メモ化キャッシュ。articles の reference 変化時に新規生成して
  // フィルター呼出のたびに重い stripHtml + 8 regex pass を回避する。
  //
  // perf 監査 (#2): readingTimeRange === "all" のときは buildReadingTimePredicate が
  // 早期 return null で cache を呼ばないため、cache 生成自体を skip して allocation を省く。
  const readingTimeCache = useMemo(
    () => (readingTimeRange === "all" ? undefined : createReadingTimeCache()),
    [articles, readingTimeRange],
  );

  const isBookmarksFeed = feedId === SPECIAL_FEED_IDS.BOOKMARKS;
  const isReadingListFeed = feedId === SPECIAL_FEED_IDS.READING_LIST;
  const isLikesFeed = feedId === SPECIAL_FEED_IDS.LIKES;
  const isHistoryFeed = feedId === SPECIAL_FEED_IDS.HISTORY;
  const isDigestFeed = feedId === SPECIAL_FEED_IDS.DIGEST;

  const bookmarkIdsForStructure = isBookmarksFeed ? bookmarkIds : EMPTY_SET;
  const readingListIdsForStructure = isReadingListFeed ? readingListIds : EMPTY_SET;
  const likeIdsForStructure = isLikesFeed ? likeIds : EMPTY_SET;
  const historyIdsForStructure = isHistoryFeed ? historyIds : EMPTY_SET;
  const articleTagsForDeps = selectedTag ? articleTags : undefined;

  const isSpecialFeed =
    isBookmarksFeed || isReadingListFeed || isLikesFeed || isHistoryFeed || isDigestFeed;
  const effectiveUnreadOnly = unreadOnly && !isSpecialFeed;

  const readIdsForState = effectiveUnreadOnly ? readIds : EMPTY_SET;
  const bookmarkIdsForState = bookmarkOnly ? bookmarkIds : EMPTY_SET;
  const readingListIdsForState = readingListOnly ? readingListIds : EMPTY_SET;
  const likeIdsForState = likeOnly ? likeIds : EMPTY_SET;
  const noteIdsForState = noteOnly ? noteIds : EMPTY_SET;
  const readBeforeForState = effectiveUnreadOnly ? readBeforeTimestamp : null;
  const historyOrderForState = isHistoryFeed ? historyOrder : EMPTY_STR_ARRAY;

  const structuralFiltered = useMemo(
    () =>
      filterByStructure(articles, {
        feedId,
        feedFilterMap,
        readIds: EMPTY_SET,
        bookmarkIds: bookmarkIdsForStructure,
        readingListIds: readingListIdsForStructure,
        likeIds: likeIdsForStructure,
        historyIds: historyIdsForStructure,
        historyOrder: EMPTY_STR_ARRAY,
        unreadOnly: false,
        bookmarkOnly: false,
        readingListOnly: false,
        likeOnly: false,
        noteOnly: false,
        noteIds: EMPTY_SET,
        query,
        sortOrder: "newest",
        dateRange,
        activeIds: activeIdsRef.current,
        nsfwMode,
        nsfwFeedIds,
        globalFilter: normalizedGlobalFilter,
        readBeforeTimestamp: null,
        snoozedUntil,
        readingTimeRange,
        readingTimeCache,
        mutedFeedIds,
        authorFilter,
        categoryFilter,
        feedCategoryMap,
        groupFeedIds,
        feedTitleByHash,
        viewFeedIds,
        selectedTag,
        articleTags: articleTagsForDeps,
        collectionArticleIds,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeIdsRef は ref; 頻繁に変わる galleryAutoReadIds による再計算を回避
    [
      articles,
      feedId,
      feedFilterMap,
      bookmarkIdsForStructure,
      readingListIdsForStructure,
      likeIdsForStructure,
      historyIdsForStructure,
      query,
      dateRange,
      nsfwMode,
      nsfwFeedIds,
      normalizedGlobalFilter,
      snoozedUntil,
      readingTimeRange,
      mutedFeedIds,
      authorFilter,
      categoryFilter,
      feedCategoryMap,
      groupFeedIds,
      feedTitleByHash,
      viewFeedIds,
      selectedTag,
      articleTagsForDeps,
      collectionArticleIds,
    ],
  );

  const filtered = useMemo(
    () =>
      applyStateFilterAndSort(structuralFiltered, {
        feedId,
        readIds: readIdsForState,
        bookmarkIds: bookmarkIdsForState,
        readingListIds: readingListIdsForState,
        likeIds: likeIdsForState,
        unreadOnly: effectiveUnreadOnly,
        bookmarkOnly,
        readingListOnly,
        likeOnly,
        noteOnly,
        noteIds: noteIdsForState,
        sortOrder,
        activeIds: activeIdsRef.current,
        readBeforeTimestamp: readBeforeForState,
        historyOrder: historyOrderForState,
        digestMode,
        groupFeedIds,
        digestLimitMap: digestLimitMap.size > 0 ? digestLimitMap : undefined,
        feedEngagementOrder,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeIdsRef は ref; 頻繁に変わる galleryAutoReadIds による再計算を回避。selectedArticleId/gracePeriodId は選択記事が unreadOnly 等で除外されないよう明示的に deps に含める
    [
      structuralFiltered,
      feedId,
      selectedArticleId,
      gracePeriodId,
      readIdsForState,
      bookmarkIdsForState,
      readingListIdsForState,
      likeIdsForState,
      effectiveUnreadOnly,
      bookmarkOnly,
      readingListOnly,
      likeOnly,
      noteOnly,
      noteIdsForState,
      sortOrder,
      readBeforeForState,
      historyOrderForState,
      digestMode,
      groupFeedIds,
      digestLimitMap,
      feedEngagementOrder,
    ],
  );

  // ── クロスフィード重複検出 ──────────────────────────────────
  // link をキーとした Set で O(n) に重複を検出する。
  // 同一リンクが複数ある場合は publishedAt が最新の記事を代表として残し、
  // 他フィード名を duplicateInfo に記録する。
  const { deduplicated, duplicateInfo } = useMemo(() => {
    if (!deduplicateByLink || !filtered.length) {
      return { deduplicated: filtered, duplicateInfo: new Map<string, string[]>() };
    }

    // link → 同一リンクを持つ記事グループ（1 パスで構築）
    const linkGroups = new Map<string, Article[]>();
    let hasDupes = false;
    for (const a of filtered) {
      if (!a.link) continue;
      const group = linkGroups.get(a.link);
      if (group) {
        group.push(a);
        hasDupes = true;
      } else {
        linkGroups.set(a.link, [a]);
      }
    }

    // 重複がなければ早期リターン（keepIds 構築コストを省く）
    if (!hasDupes) {
      return { deduplicated: filtered, duplicateInfo: new Map<string, string[]>() };
    }

    // 代表記事の ID セットと、代表 ID → 他フィード名一覧を 1 パスで構築
    const info = new Map<string, string[]>();
    const keepIds = new Set<string>();
    for (const group of linkGroups.values()) {
      if (group.length === 1) {
        keepIds.add(group[0].id);
        continue;
      }
      // publishedAt が最新の記事を代表にする
      let best = group[0];
      for (let i = 1; i < group.length; i++) {
        const curr = group[i];
        if ((curr.publishedAt ?? curr.createdAt) > (best.publishedAt ?? best.createdAt)) {
          best = curr;
        }
      }
      keepIds.add(best.id);
      // 代表以外のフィード名を収集
      const otherFeedNames: string[] = [];
      for (const a of group) {
        if (a.id !== best.id) {
          const name = feedTitleByHash.get(a.feedHash);
          if (name) otherFeedNames.push(name);
        }
      }
      if (otherFeedNames.length > 0) info.set(best.id, otherFeedNames);
    }

    // link が空の記事はそのまま残す（Set.has は O(1)）
    return {
      deduplicated: filtered.filter((a) => !a.link || keepIds.has(a.id)),
      duplicateInfo: info,
    };
  }, [filtered, deduplicateByLink, feedTitleByHash]);

  const { visible, hasMore, sentinelRef, notifyArticlesAdded } = useArticlePagination(
    deduplicated,
    page,
    setPage,
  );

  return {
    filtered: deduplicated,
    visible,
    hasMore,
    unreadOnly,
    toggleUnreadOnly: filters.toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly: filters.toggleBookmarkOnly,
    readingListOnly,
    toggleReadingListOnly: filters.toggleReadingListOnly,
    likeOnly,
    toggleLikeOnly: filters.toggleLikeOnly,
    noteOnly,
    toggleNoteOnly: filters.toggleNoteOnly,
    digestMode,
    toggleDigestMode: filters.toggleDigestMode,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange: filters.cycleDateRange,
    query: filters.query,
    rawQuery: filters.rawQuery,
    updateQuery: filters.updateQuery,
    searchRef: filters.searchRef,
    sentinelRef,
    globalFilter,
    setGlobalFilter,
    notifyArticlesAdded,
    readingTimeRange,
    cycleReadingTimeRange: filters.cycleReadingTimeRange,
    authorFilter,
    setAuthorFilter: filters.setAuthorFilter,
    categoryFilter,
    setCategoryFilter: filters.setCategoryFilter,
    duplicateInfo,
  };
}

export type FilterState = ReturnType<typeof useFilteredArticles>;
