"use client";

import { useState, useCallback, useMemo } from "react";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";

/** 閲覧履歴の1エントリ */
interface HistoryEntry {
  articleId: string;
  viewedAt: string; // ISO 8601
}

const MAX_HISTORY = 50;

/**
 * 記事閲覧履歴を localStorage に永続化するフック。
 * 最大 MAX_HISTORY 件を viewedAt 降順で保持する。
 * 同一記事を再閲覧した場合は先頭に移動する（重複なし）。
 *
 * @returns historyIds - 閲覧済み記事 ID の Set（フィルタリング用）
 * @returns historyOrder - 閲覧順の記事 ID 配列（viewedAt 降順）
 * @returns addToHistory - 閲覧記録を追加する関数
 */
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
    const historyOrder = history.map((e) => e.articleId);
    return { historyIds: new Set(historyOrder), historyOrder };
  }, [history]);

  return { historyIds, historyOrder, addToHistory };
}
