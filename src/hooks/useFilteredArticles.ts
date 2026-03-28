import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Article, DateRange, Feed } from "../types";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { useDebounce } from "./useDebounce";
import { cycleValue, DATE_RANGE_CYCLE } from "../lib/article-utils";
import { filterAndSortArticles } from "../lib/article-filter";

const PAGE_SIZE = 30;
const EMPTY_SET = new Set<string>();
const EMPTY_STR_ARRAY: string[] = [];
const EMPTY_FEED_ARRAY: Feed[] = [];

/** boolean state をトグルして localStorage に保存するステート更新関数を返す */
function boolToggleWithStorage(key: string) {
  return (v: boolean): boolean => {
    const next = !v;
    storageSet(key, next ? "1" : "0");
    return next;
  };
}

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
}

export type SortOrder = "newest" | "oldest";

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
}: Options) {
  const [unreadOnly, setUnreadOnly] = useState(() => storageGet(STORAGE_KEYS.UNREAD_ONLY) === "1");
  const [bookmarkOnly, setBookmarkOnly] = useState(
    () => storageGet(STORAGE_KEYS.BOOKMARK_ONLY) === "1",
  );
  const [readingListOnly, setReadingListOnly] = useState(
    () => storageGet(STORAGE_KEYS.READING_LIST_ONLY) === "1",
  );
  const [rawQuery, setRawQuery] = useState(""); // 入力値（即時更新）
  const query = useDebounce(rawQuery, 300); // デバウンス済みクエリ（フィルター・ハイライト用）
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const v = storageGet(STORAGE_KEYS.SORT_ORDER);
    return v === "oldest" ? "oldest" : "newest";
  });
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const v = storageGet(STORAGE_KEYS.DATE_RANGE);
    return DATE_RANGE_CYCLE.includes(v as DateRange) ? (v as DateRange) : "all";
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dateRangeRef = useRef(dateRange);

  // useEffect 不要 — レンダー中の直接代入で十分
  dateRangeRef.current = dateRange;

  // 直前に選択していた記事を一定時間フィルター対象外にする（未読フィルター中でも前の記事に戻れるように）
  const [gracePeriodId, setGracePeriodId] = useState<string | null>(null);
  const gracePeriodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedIdRef = useRef<string | null | undefined>(selectedArticleId);
  useEffect(() => {
    const prev = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selectedArticleId;
    if (prev && prev !== selectedArticleId) {
      setGracePeriodId(prev);
      if (gracePeriodTimerRef.current) clearTimeout(gracePeriodTimerRef.current);
      gracePeriodTimerRef.current = setTimeout(() => setGracePeriodId(null), 5000);
    }
    return () => {
      if (gracePeriodTimerRef.current) clearTimeout(gracePeriodTimerRef.current);
    };
  }, [selectedArticleId]);

  // フィード切り替え時にページ・検索クエリをリセット
  useEffect(() => {
    setPage(1);
    setRawQuery("");
  }, [feedId]);

  const toggleUnreadOnly = useCallback(() => {
    setUnreadOnly(boolToggleWithStorage(STORAGE_KEYS.UNREAD_ONLY));
    setPage(1);
  }, []);

  const toggleBookmarkOnly = useCallback(() => {
    setBookmarkOnly(boolToggleWithStorage(STORAGE_KEYS.BOOKMARK_ONLY));
    setPage(1);
  }, []);

  const toggleReadingListOnly = useCallback(() => {
    setReadingListOnly(boolToggleWithStorage(STORAGE_KEYS.READING_LIST_ONLY));
    setPage(1);
  }, []);

  const updateQuery = useCallback((q: string) => {
    setRawQuery(q);
    setPage(1);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((v) => {
      const next = v === "newest" ? "oldest" : "newest";
      storageSet(STORAGE_KEYS.SORT_ORDER, next);
      return next;
    });
    setPage(1);
  }, []);

  const cycleDateRange = useCallback((): DateRange => {
    const next = cycleValue(DATE_RANGE_CYCLE, dateRangeRef.current);
    storageSet(STORAGE_KEYS.DATE_RANGE, next);
    setDateRange(next);
    setPage(1);
    return next;
  }, []);

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // 現在表示中の記事は既読でもリストに残す（前後ナビが消えないようにするため）
  // gracePeriodId: 直前まで表示していた記事を5秒間保持（未読フィルター中でも前の記事に戻れるように）
  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedArticleId) ids.add(selectedArticleId);
    if (gracePeriodId) ids.add(gracePeriodId);
    return ids;
  }, [selectedArticleId, gracePeriodId]);

  const filtered = useMemo(
    () =>
      filterAndSortArticles(articles, {
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
        query,
        sortOrder,
        dateRange,
        activeIds,
        nsfwMode,
        nsfwFeedIds,
      }),
    [
      articles,
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
      query,
      sortOrder,
      dateRange,
      activeIds,
      nsfwMode,
      nsfwFeedIds,
    ],
  );

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  // hasMore を依存配列に含めることで、記事が非同期でロードされて
  // sentinel が初めてマウントされたタイミングでも observer をセットアップできる
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return {
    filtered,
    visible,
    hasMore,
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    readingListOnly,
    toggleReadingListOnly,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    query, // デバウンス済み（フィルター・ハイライト用）
    rawQuery, // 即時値（検索 input の value 用）
    updateQuery,
    searchRef,
    sentinelRef,
  };
}
