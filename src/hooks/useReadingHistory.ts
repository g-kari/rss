"use client";

import { useState, useCallback, useMemo } from "react";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";

interface HistoryEntry {
  articleId: string;
  viewedAt: string; // ISO 8601
}

const MAX_HISTORY = 50;

export function useReadingHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadJson<HistoryEntry[]>(STORAGE_KEYS.HISTORY, []),
  );

  const addToHistory = useCallback((articleId: string) => {
    setHistory((prev) => {
      const without = prev.filter((e) => e.articleId !== articleId);
      const next = [{ articleId, viewedAt: new Date().toISOString() }, ...without].slice(
        0,
        MAX_HISTORY,
      );
      saveJson(STORAGE_KEYS.HISTORY, next);
      return next;
    });
  }, []);

  const { historyIds, historyOrder } = useMemo(() => {
    const historyIds = new Set(history.map((e) => e.articleId));
    return { historyIds, historyOrder: [...historyIds] };
  }, [history]);

  return { historyIds, historyOrder, addToHistory };
}
