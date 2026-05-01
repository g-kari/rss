import { useState, useMemo, useRef, useCallback } from "react";
import type { Article, Feed, FeedView, KeywordFilter } from "../types";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { useGracePeriod } from "./useGracePeriod";
import { filterByStructure, applyStateFilterAndSort } from "../lib/article-filter";
import { buildFilterMap, normalizeFilter, type CompiledKeywordFilter } from "../lib/keyword-filter";
import { useArticleFilters } from "./useArticleFilters";
import { useArticleSorting } from "./useArticleSorting";
import { useArticlePagination } from "./useArticlePagination";

const EMPTY_SET = new Set<string>();
const EMPTY_STR_ARRAY: string[] = [];
const EMPTY_FEED_ARRAY: Feed[] = [];

interface Options {
  articles: Article[];
  feeds?: Feed[];
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds?: Set<string>;
  historyIds?: Set<string>;
  historyOrder?: string[];
  selectedArticleId?: string | null;
  nsfwMode?: boolean;
  nsfwFeedIds?: Set<string>;
  globalFilter: KeywordFilter | null;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  readBeforeTimestamp?: string | null;
  snoozedUntil?: Record<string, string>;
  mutedFeedIds?: Set<string>;
  notes?: Record<string, string>;
  groupFeedIds?: Set<string>;
  selectedGroupId?: string | null;
  activeFeedView?: FeedView;
  articleTags?: Record<string, string[]>;
  selectedTag?: string | null;
  collectionArticleIds?: Set<string>;
  galleryAutoReadIds?: Set<string>;
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
}: Options) {
  const [page, setPage] = useState(1);
  const resetPage = useCallback(() => setPage(1), []);

  const filters = useArticleFilters({ feedId, selectedGroupId, resetPage });
  const { sortOrder, toggleSortOrder } = useArticleSorting(resetPage);

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

  const noteIds = useMemo(() => new Set(Object.keys(notes ?? {})), [notes]);

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

  const isBookmarksFeed = feedId === SPECIAL_FEED_IDS.BOOKMARKS;
  const isReadingListFeed = feedId === SPECIAL_FEED_IDS.READING_LIST;
  const isLikesFeed = feedId === SPECIAL_FEED_IDS.LIKES;
  const isHistoryFeed = feedId === SPECIAL_FEED_IDS.HISTORY;

  const bookmarkIdsForStructure = isBookmarksFeed ? bookmarkIds : EMPTY_SET;
  const readingListIdsForStructure = isReadingListFeed ? readingListIds : EMPTY_SET;
  const likeIdsForStructure = isLikesFeed ? likeIds : EMPTY_SET;
  const historyIdsForStructure = isHistoryFeed ? historyIds : EMPTY_SET;
  const articleTagsForDeps = selectedTag ? articleTags : undefined;

  const readIdsForState = unreadOnly ? readIds : EMPTY_SET;
  const bookmarkIdsForState = bookmarkOnly ? bookmarkIds : EMPTY_SET;
  const readingListIdsForState = readingListOnly ? readingListIds : EMPTY_SET;
  const likeIdsForState = likeOnly ? likeIds : EMPTY_SET;
  const noteIdsForState = noteOnly ? noteIds : EMPTY_SET;
  const readBeforeForState = unreadOnly ? readBeforeTimestamp : null;
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
        activeIds,
        nsfwMode,
        nsfwFeedIds,
        globalFilter: normalizedGlobalFilter,
        readBeforeTimestamp: null,
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
        articleTags: articleTagsForDeps,
        collectionArticleIds,
      }),
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
      activeIds,
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
        unreadOnly,
        bookmarkOnly,
        readingListOnly,
        likeOnly,
        noteOnly,
        noteIds: noteIdsForState,
        sortOrder,
        activeIds,
        readBeforeTimestamp: readBeforeForState,
        historyOrder: historyOrderForState,
        digestMode,
        groupFeedIds,
      }),
    [
      structuralFiltered,
      feedId,
      readIdsForState,
      bookmarkIdsForState,
      readingListIdsForState,
      likeIdsForState,
      unreadOnly,
      bookmarkOnly,
      readingListOnly,
      likeOnly,
      noteOnly,
      noteIdsForState,
      sortOrder,
      activeIds,
      readBeforeForState,
      historyOrderForState,
      digestMode,
      groupFeedIds,
    ],
  );

  const { visible, hasMore, sentinelRef, notifyArticlesAdded } = useArticlePagination(
    filtered,
    page,
    setPage,
  );

  return {
    filtered,
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
  };
}

export type FilterState = ReturnType<typeof useFilteredArticles>;
