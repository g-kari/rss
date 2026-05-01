import { useState, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { DateRange, ReadingTimeRange } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, storageGet, storageSet, loadStoredEnum } from "../lib/storage";
import { useDebounce } from "./useDebounce";
import { cycleValue, DATE_RANGE_CYCLE, READING_TIME_RANGE_CYCLE } from "../lib/article-utils";

function toggleBoolFilter(
  setter: Dispatch<SetStateAction<boolean>>,
  key: string,
  resetPage: () => void,
): void {
  setter((v) => {
    const next = !v;
    storageSet(key, next ? "1" : "0");
    return next;
  });
  resetPage();
}

function makeCycler<T extends string>(
  cycle: readonly T[],
  ref: { readonly current: T },
  storageKey: string,
  setState: Dispatch<SetStateAction<T>>,
  resetPage: () => void,
): () => T {
  return () => {
    const next = cycleValue(cycle, ref.current);
    storageSet(storageKey, next);
    setState(next);
    resetPage();
    return next;
  };
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
  const [unreadOnly, setUnreadOnly] = useState(() => storageGet(STORAGE_KEYS.UNREAD_ONLY) === "1");
  const [bookmarkOnly, setBookmarkOnly] = useState(
    () => storageGet(STORAGE_KEYS.BOOKMARK_ONLY) === "1",
  );
  const [readingListOnly, setReadingListOnly] = useState(
    () => storageGet(STORAGE_KEYS.READING_LIST_ONLY) === "1",
  );
  const [likeOnly, setLikeOnly] = useState(() => storageGet(STORAGE_KEYS.LIKE_ONLY) === "1");
  const [noteOnly, setNoteOnly] = useState(() => storageGet(STORAGE_KEYS.NOTE_ONLY) === "1");
  const [digestMode, setDigestMode] = useState(() => storageGet(STORAGE_KEYS.DIGEST_MODE) === "1");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, selectedGroupId]);

  const {
    toggleUnreadOnly,
    toggleBookmarkOnly,
    toggleReadingListOnly,
    toggleLikeOnly,
    toggleNoteOnly,
    toggleDigestMode,
    updateQuery,
    cycleDateRange,
    cycleReadingTimeRange,
  } = useMemo(() => {
    const rp = () => resetPageRef.current();
    return {
      toggleUnreadOnly: () => toggleBoolFilter(setUnreadOnly, STORAGE_KEYS.UNREAD_ONLY, rp),
      toggleBookmarkOnly: () => toggleBoolFilter(setBookmarkOnly, STORAGE_KEYS.BOOKMARK_ONLY, rp),
      toggleReadingListOnly: () =>
        toggleBoolFilter(setReadingListOnly, STORAGE_KEYS.READING_LIST_ONLY, rp),
      toggleLikeOnly: () => toggleBoolFilter(setLikeOnly, STORAGE_KEYS.LIKE_ONLY, rp),
      toggleNoteOnly: () => toggleBoolFilter(setNoteOnly, STORAGE_KEYS.NOTE_ONLY, rp),
      toggleDigestMode: () => toggleBoolFilter(setDigestMode, STORAGE_KEYS.DIGEST_MODE, rp),
      updateQuery: (q: string) => {
        setRawQuery(q);
        resetPageRef.current();
      },
      cycleDateRange: makeCycler(
        DATE_RANGE_CYCLE,
        dateRangeRef,
        STORAGE_KEYS.DATE_RANGE,
        setDateRange,
        rp,
      ),
      cycleReadingTimeRange: makeCycler(
        READING_TIME_RANGE_CYCLE,
        readingTimeRangeRef,
        STORAGE_KEYS.READING_TIME_RANGE,
        setReadingTimeRange,
        rp,
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    unreadOnly,
    bookmarkOnly,
    readingListOnly,
    likeOnly,
    noteOnly,
    digestMode,
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
