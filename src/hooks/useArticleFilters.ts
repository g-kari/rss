import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DateRange, ReadingTimeRange } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, storageGet, storageSet, loadStoredEnum } from "../lib/storage";
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
): void {
  setBoolFilters((prev) => {
    const next = !prev[key];
    storageSet(BOOL_FILTER_STORAGE[key], next ? "1" : "0");
    return { ...prev, [key]: next };
  });
  resetPage();
}

interface UseArticleFiltersOptions {
  feedId: string | null;
  selectedGroupId: string | null;
  resetPage: () => void;
}

export function useArticleFilters({
  feedId,
  selectedGroupId,
  resetPage,
}: UseArticleFiltersOptions) {
  const [boolFilters, setBoolFilters] = useState<Record<BoolFilterKey, boolean>>(
    () =>
      Object.fromEntries(
        (Object.keys(BOOL_FILTER_STORAGE) as BoolFilterKey[]).map((k) => [
          k,
          storageGet(BOOL_FILTER_STORAGE[k]) === "1",
        ]),
      ) as Record<BoolFilterKey, boolean>,
  );

  const [dateRange, setDateRange] = useState<DateRange>(() =>
    loadStoredEnum(STORAGE_KEYS.DATE_RANGE, DATE_RANGE_CYCLE, "all"),
  );
  const [readingTimeRange, setReadingTimeRange] = useState<ReadingTimeRange>(() =>
    loadStoredEnum(STORAGE_KEYS.READING_TIME_RANGE, READING_TIME_RANGE_CYCLE, "all"),
  );

  const [rawQuery, setRawQuery] = useState("");
  const query = useDebounce(rawQuery, 300);

  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const dateRangeRef = useSyncedRef(dateRange);
  const readingTimeRangeRef = useSyncedRef(readingTimeRange);
  const resetPageRef = useSyncedRef(resetPage);

  useEffect(() => {
    resetPageRef.current();
    setRawQuery("");
    setAuthorFilter(null);
    setCategoryFilter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetPageRef は useSyncedRef の安定参照。フィード/グループ切替時のみリセット
  }, [feedId, selectedGroupId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- setBoolFilters は安定参照。resetPageRef は useSyncedRef の安定 ref
  const toggleUnreadOnly = useCallback(
    () => toggleBoolFilter("unreadOnly", setBoolFilters, resetPageRef.current),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleBookmarkOnly = useCallback(
    () => toggleBoolFilter("bookmarkOnly", setBoolFilters, resetPageRef.current),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleReadingListOnly = useCallback(
    () => toggleBoolFilter("readingListOnly", setBoolFilters, resetPageRef.current),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleLikeOnly = useCallback(
    () => toggleBoolFilter("likeOnly", setBoolFilters, resetPageRef.current),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleNoteOnly = useCallback(
    () => toggleBoolFilter("noteOnly", setBoolFilters, resetPageRef.current),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleDigestMode = useCallback(
    () => toggleBoolFilter("digestMode", setBoolFilters, resetPageRef.current),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateQuery = useCallback((q: string) => {
    setRawQuery(q);
    resetPageRef.current();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dateRangeRef・resetPageRef は安定 ref
  const cycleDateRange = useCallback((): DateRange => {
    const next = cycleValue(DATE_RANGE_CYCLE, dateRangeRef.current);
    storageSet(STORAGE_KEYS.DATE_RANGE, next);
    setDateRange(next);
    resetPageRef.current();
    return next;
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- readingTimeRangeRef・resetPageRef は安定 ref
  const cycleReadingTimeRange = useCallback((): ReadingTimeRange => {
    const next = cycleValue(READING_TIME_RANGE_CYCLE, readingTimeRangeRef.current);
    storageSet(STORAGE_KEYS.READING_TIME_RANGE, next);
    setReadingTimeRange(next);
    resetPageRef.current();
    return next;
  }, []);

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
