import { useState, useCallback } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

const MAX_HISTORY = 10;

function loadHistory(): string[] {
  try {
    const raw = storageGet(STORAGE_KEYS.SEARCH_HISTORY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  storageSet(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(history));
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => loadHistory());

  const addToHistory = useCallback((query: string) => {
    const q = query.trim();
    if (q.length < 2) return;
    setHistory((prev) => {
      const deduped = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
      saveHistory(deduped);
      return deduped;
    });
  }, []);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== query);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return { history, addToHistory, removeFromHistory, clearHistory };
}
