import { useState, useMemo } from "react";
import type { SortOrder } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, storageSet, loadStoredEnum } from "../lib/storage";
import { cycleValue, SORT_ORDER_CYCLE } from "../lib/article-utils";

export function useArticleSorting(resetPage: () => void) {
  const [sortOrder, setSortOrder] = useState<SortOrder>(() =>
    loadStoredEnum(STORAGE_KEYS.SORT_ORDER, SORT_ORDER_CYCLE, "newest"),
  );
  const sortOrderRef = useSyncedRef(sortOrder);
  const resetPageRef = useSyncedRef(resetPage);

  const toggleSortOrder = useMemo(
    () => () => {
      const next = cycleValue(SORT_ORDER_CYCLE, sortOrderRef.current);
      storageSet(STORAGE_KEYS.SORT_ORDER, next);
      setSortOrder(next);
      resetPageRef.current();
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sortOrderRef・resetPageRef は useSyncedRef の安定参照のため deps 不要
    [],
  );

  return { sortOrder, toggleSortOrder } as const;
}
