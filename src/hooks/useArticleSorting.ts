import { useState, useMemo, useEffect } from "react";
import type { FeedView, SortOrder } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, storageSet, loadStoredEnum, getFeedViewStorageKey } from "../lib/storage";
import { cycleValue, SORT_ORDER_CYCLE } from "../lib/article-utils";

export function useArticleSorting(resetPage: () => void, activeFeedView: FeedView = "articles") {
  const [sortOrder, setSortOrder] = useState<SortOrder>(() =>
    loadStoredEnum(
      getFeedViewStorageKey(STORAGE_KEYS.SORT_ORDER, activeFeedView),
      SORT_ORDER_CYCLE,
      "newest",
    ),
  );
  const sortOrderRef = useSyncedRef(sortOrder);
  const resetPageRef = useSyncedRef(resetPage);
  const feedViewRef = useSyncedRef(activeFeedView);

  // activeFeedView 切り替え時に sortOrder を localStorage から再ロード
  useEffect(() => {
    setSortOrder(
      loadStoredEnum(
        getFeedViewStorageKey(STORAGE_KEYS.SORT_ORDER, activeFeedView),
        SORT_ORDER_CYCLE,
        "newest",
      ),
    );
  }, [activeFeedView]);

  const toggleSortOrder = useMemo(
    () => () => {
      const next = cycleValue(SORT_ORDER_CYCLE, sortOrderRef.current);
      storageSet(getFeedViewStorageKey(STORAGE_KEYS.SORT_ORDER, feedViewRef.current), next);
      setSortOrder(next);
      resetPageRef.current();
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortOrderRef・resetPageRef・feedViewRef は useSyncedRef の安定参照のため deps 不要
    [],
  );

  return { sortOrder, toggleSortOrder } as const;
}
