import { useState, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
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
    const toggle = (key: BoolFilterKey) => () => toggleBoolFilter(key, setBoolFilters, rp);
    return {
      toggleUnreadOnly: toggle("unreadOnly"),
      toggleBookmarkOnly: toggle("bookmarkOnly"),
      toggleReadingListOnly: toggle("readingListOnly"),
      toggleLikeOnly: toggle("likeOnly"),
      toggleNoteOnly: toggle("noteOnly"),
      toggleDigestMode: toggle("digestMode"),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 全 setter・ref は安定参照。マウント時に一度だけ生成するメモ化オブジェクト
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
