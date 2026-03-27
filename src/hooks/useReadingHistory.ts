"use client";

import { useState, useCallback, useMemo } from "react";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";

interface HistoryEntry {
  articleId: string;
  viewedAt: string; // ISO 8601
}

/** 閲覧履歴の最大保持件数 */
const MAX_HISTORY = 50;

function loadHistory(): HistoryEntry[] {
  return loadJson<HistoryEntry[]>(STORAGE_KEYS.HISTORY, []);
}

/**
 * 記事の閲覧履歴を管理するフック（localStorage のみ、最新 50 件）。
 * 記事を開くたびに先頭に追加し、同一記事は重複排除する。
 */
export function useReadingHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const addToHistory = useCallback((articleId: string) => {
    setHistory((prev) => {
      // 同一記事の重複を除去してから先頭に追加
      const without = prev.filter((e) => e.articleId !== articleId);
      const next = [{ articleId, viewedAt: new Date().toISOString() }, ...without].slice(
        0,
        MAX_HISTORY,
      );
      saveJson(STORAGE_KEYS.HISTORY, next);
      return next;
    });
  }, []);

  /** 履歴に含まれる articleId の Set（フィルタリング用） */
  const historyIds = useMemo(() => new Set(history.map((e) => e.articleId)), [history]);

  /** 最近閲覧した順の articleId 配列（ソート用） */
  const historyOrder = useMemo(() => history.map((e) => e.articleId), [history]);

  return { historyIds, historyOrder, addToHistory };
}
