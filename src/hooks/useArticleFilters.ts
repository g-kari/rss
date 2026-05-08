import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DateRange, FeedView, ReadingTimeRange } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import {
  STORAGE_KEYS,
  storageGet,
  storageSet,
  loadStoredEnum,
  getFeedViewStorageKey,
} from "../lib/storage";
import { useDebounce } from "./useDebounce";
import { cycleValue, DATE_RANGE_CYCLE, READING_TIME_RANGE_CYCLE } from "../lib/article-utils";

type BoolFilterKey =
  | "unreadOnly"
  | "bookmarkOnly"
  | "readingListOnly"
  | "likeOnly"
  | "noteOnly"
  | "digestMode";

const BOOL_FILTER_STORAGE: Record<BoolFilterKey, string> = {
  unreadOnly: STORAGE_KEYS.UNREAD_ONLY,
  bookmarkOnly: STORAGE_KEYS.BOOKMARK_ONLY,
  readingListOnly: STORAGE_KEYS.READING_LIST_ONLY,
  likeOnly: STORAGE_KEYS.LIKE_ONLY,
  noteOnly: STORAGE_KEYS.NOTE_ONLY,
  digestMode: STORAGE_KEYS.DIGEST_MODE,
};

function toggleBoolFilter(
  key: BoolFilterKey,
  setBoolFilters: Dispatch<SetStateAction<Record<BoolFilterKey, boolean>>>,
  resetPage: () => void,
  feedView: FeedView,
): void {
  setBoolFilters((prev) => {
    const next = !prev[key];
    storageSet(getFeedViewStorageKey(BOOL_FILTER_STORAGE[key], feedView), next ? "1" : "0");
    return { ...prev, [key]: next };
  });
  resetPage();
}

function loadBoolFilters(feedView: FeedView): Record<BoolFilterKey, boolean> {
  return Object.fromEntries(
    (Object.keys(BOOL_FILTER_STORAGE) as BoolFilterKey[]).map((k) => [
      k,
      storageGet(getFeedViewStorageKey(BOOL_FILTER_STORAGE[k], feedView)) === "1",
    ]),
  ) as Record<BoolFilterKey, boolean>;
}

interface UseArticleFiltersOptions {
  feedId: string | null;
  selectedGroupId: string | null;
  resetPage: () => void;
  activeFeedView?: FeedView;
}

export function useArticleFilters({
  feedId,
  selectedGroupId,
  resetPage,
  activeFeedView = "articles",
}: UseArticleFiltersOptions) {
  const [boolFilters, setBoolFilters] = useState<Record<BoolFilterKey, boolean>>(() =>
    loadBoolFilters(activeFeedView),
  );

  const [dateRange, setDateRange] = useState<DateRange>(() =>
    loadStoredEnum(
      getFeedViewStorageKey(STORAGE_KEYS.DATE_RANGE, activeFeedView),
      DATE_RANGE_CYCLE,
      "all",
    ),
  );
  const [readingTimeRange, setReadingTimeRange] = useState<ReadingTimeRange>(() =>
    loadStoredEnum(
      getFeedViewStorageKey(STORAGE_KEYS.READING_TIME_RANGE, activeFeedView),
      READING_TIME_RANGE_CYCLE,
      "all",
    ),
  );

  const [rawQuery, setRawQuery] = useState("");
  const query = useDebounce(rawQuery, 300);

  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const dateRangeRef = useSyncedRef(dateRange);
  const readingTimeRangeRef = useSyncedRef(readingTimeRange);
  const resetPageRef = useSyncedRef(resetPage);
  const feedViewRef = useSyncedRef(activeFeedView);

  useEffect(() => {
    resetPageRef.current();
    setRawQuery("");
    setAuthorFilter(null);
    setCategoryFilter(null);
  }, [feedId, selectedGroupId, resetPageRef]);

  // activeFeedView 切り替え時に各フィルターを localStorage から再ロード
  useEffect(() => {
    setBoolFilters(loadBoolFilters(activeFeedView));
    setDateRange(
      loadStoredEnum(
        getFeedViewStorageKey(STORAGE_KEYS.DATE_RANGE, activeFeedView),
        DATE_RANGE_CYCLE,
        "all",
      ),
    );
    setReadingTimeRange(
      loadStoredEnum(
        getFeedViewStorageKey(STORAGE_KEYS.READING_TIME_RANGE, activeFeedView),
        READING_TIME_RANGE_CYCLE,
        "all",
      ),
    );
    resetPageRef.current();
  }, [activeFeedView, resetPageRef]);

  // setBoolFilters は useState setter（常に安定）、resetPageRef は useSyncedRef（常に安定）。
  // ref を依存配列に含めることで eslint-disable なしに同等の効果を得る。
  const toggleUnreadOnly = useCallback(
    () => toggleBoolFilter("unreadOnly", setBoolFilters, resetPageRef.current, feedViewRef.current),
    [resetPageRef, feedViewRef],
  );
  const toggleBookmarkOnly = useCallback(
    () =>
      toggleBoolFilter("bookmarkOnly", setBoolFilters, resetPageRef.current, feedViewRef.current),
    [resetPageRef, feedViewRef],
  );
  const toggleReadingListOnly = useCallback(
    () =>
      toggleBoolFilter(
        "readingListOnly",
        setBoolFilters,
        resetPageRef.current,
        feedViewRef.current,
      ),
    [resetPageRef, feedViewRef],
  );
  const toggleLikeOnly = useCallback(
    () => toggleBoolFilter("likeOnly", setBoolFilters, resetPageRef.current, feedViewRef.current),
    [resetPageRef, feedViewRef],
  );
  const toggleNoteOnly = useCallback(
    () => toggleBoolFilter("noteOnly", setBoolFilters, resetPageRef.current, feedViewRef.current),
    [resetPageRef, feedViewRef],
  );
  const toggleDigestMode = useCallback(
    () => toggleBoolFilter("digestMode", setBoolFilters, resetPageRef.current, feedViewRef.current),
    [resetPageRef, feedViewRef],
  );
  const updateQuery = useCallback(
    (q: string) => {
      setRawQuery(q);
      resetPageRef.current();
    },
    [resetPageRef],
  );
  // dateRangeRef・readingTimeRangeRef・resetPageRef・feedViewRef はいずれも useSyncedRef（常に安定）
  const cycleDateRange = useCallback((): DateRange => {
    const next = cycleValue(DATE_RANGE_CYCLE, dateRangeRef.current);
    storageSet(getFeedViewStorageKey(STORAGE_KEYS.DATE_RANGE, feedViewRef.current), next);
    setDateRange(next);
    resetPageRef.current();
    return next;
  }, [dateRangeRef, resetPageRef, feedViewRef]);
  const cycleReadingTimeRange = useCallback((): ReadingTimeRange => {
    const next = cycleValue(READING_TIME_RANGE_CYCLE, readingTimeRangeRef.current);
    storageSet(getFeedViewStorageKey(STORAGE_KEYS.READING_TIME_RANGE, feedViewRef.current), next);
    setReadingTimeRange(next);
    resetPageRef.current();
    return next;
  }, [readingTimeRangeRef, resetPageRef, feedViewRef]);

  return {
    ...boolFilters,
    dateRange,
    readingTimeRange,
    rawQuery,
    query,
    authorFilter,
    categoryFilter,
    searchRef,
    toggleUnreadOnly,
    toggleBookmarkOnly,
    toggleReadingListOnly,
    toggleLikeOnly,
    toggleNoteOnly,
    toggleDigestMode,
    updateQuery,
    cycleDateRange,
    cycleReadingTimeRange,
    setAuthorFilter,
    setCategoryFilter,
  };
}

export type ArticleFilterState = ReturnType<typeof useArticleFilters>;
