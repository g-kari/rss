import { useState, useCallback } from "react";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";

const MAX_HISTORY = 10;

/**
 * 検索履歴を localStorage に永続化するフック。
 * 最大 MAX_HISTORY 件を保持し、重複クエリは先頭に移動して dedup する。
 * 2文字未満のクエリは記録しない。
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.SEARCH_HISTORY, []),
  );

  const addToHistory = useCallback((query: string) => {
    const q = query.trim();
    if (q.length < 2) return;
    setHistory((prev) => {
      const deduped = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
      saveJson(STORAGE_KEYS.SEARCH_HISTORY, deduped);
      return deduped;
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== query);
      saveJson(STORAGE_KEYS.SEARCH_HISTORY, next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveJson(STORAGE_KEYS.SEARCH_HISTORY, []);
  }, []);

  return { history, addToHistory, removeFromHistory, clearHistory };
}
