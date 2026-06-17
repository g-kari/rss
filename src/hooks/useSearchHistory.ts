import { useCallback } from "react";
import { STORAGE_KEYS } from "../lib/storage";
import { useLocalStorageHistory } from "./useLocalStorageHistory";

const MAX_HISTORY = 10;

/**
 * 検索履歴を localStorage に永続化するフック。
 * 最大 MAX_HISTORY 件を保持し、重複クエリは先頭に移動して dedup する。
 * 2文字未満のクエリは記録しない。
 */
export function useSearchHistory() {
  const {
    items: history,
    prepend,
    remove,
    clear,
  } = useLocalStorageHistory<string>(
    STORAGE_KEYS.SEARCH_HISTORY,
    MAX_HISTORY,
    [],
    (v): v is string => typeof v === "string",
  );

  const addToHistory = useCallback(
    (query: string) => {
      const q = query.trim();
      if (q.length < 2) return;
      prepend(q);
    },
    [prepend],
  );

  const removeFromHistory = useCallback(
    (query: string) => {
      remove((h) => h === query);
    },
    [remove],
  );

  return { history, addToHistory, removeFromHistory, clearHistory: clear };
}
