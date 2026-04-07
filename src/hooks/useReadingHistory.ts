"use client";

import { useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "../lib/storage";
import { useLocalStorageHistory } from "./useLocalStorageHistory";

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
  const { items: history, prepend } = useLocalStorageHistory<HistoryEntry>(
    STORAGE_KEYS.HISTORY,
    MAX_HISTORY,
  );

  const addToHistory = useCallback(
    (articleId: string) => {
      prepend({ articleId, viewedAt: new Date().toISOString() }, (e) => e.articleId);
    },
    [prepend],
  );

  const { historyIds, historyOrder } = useMemo(() => {
    const historyOrder = history.map((e) => e.articleId);
    return { historyIds: new Set(historyOrder), historyOrder };
  }, [history]);

  return { historyIds, historyOrder, addToHistory };
}
