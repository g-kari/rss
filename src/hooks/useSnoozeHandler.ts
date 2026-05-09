"use client";

import { useCallback, useMemo } from "react";
import type { Article } from "../types";

interface ToastApi {
  info: (msg: string) => void;
}

interface UseSnoozeHandlerOptions {
  snoozeTargetId: string | null;
  articles: Article[];
  filtered: Article[];
  snoozeArticle: (id: string, durationMs: number) => void;
  setSelectedArticle: (a: Article | null) => void;
  toast: ToastApi;
}

export interface SnoozeHandlerState {
  /** スヌーズ対象記事のタイトル (UI モーダル表示用、対象なしなら空文字) */
  snoozeArticleTitle: string;
  /** スヌーズを実行: 既読化マーク + toast + 次記事へ自動遷移 */
  handleSnooze: (durationMs: number) => void;
}

/**
 * スヌーズ実行ハンドラと表示用記事タイトルを集約する hook (#650 Step 1c)。
 *
 * 元 `App.tsx` の handleSnooze + snoozeArticleTitle を切り出し。
 * スヌーズ後の「次記事自動遷移」は filtered 配列での隣接記事を選択する。
 */
export function useSnoozeHandler({
  snoozeTargetId,
  articles,
  filtered,
  snoozeArticle,
  setSelectedArticle,
  toast,
}: UseSnoozeHandlerOptions): SnoozeHandlerState {
  const snoozeArticleTitle = useMemo(
    () => (snoozeTargetId ? (articles.find((a) => a.id === snoozeTargetId)?.title ?? "") : ""),
    [snoozeTargetId, articles],
  );

  const handleSnooze = useCallback(
    (durationMs: number) => {
      if (!snoozeTargetId) return;
      snoozeArticle(snoozeTargetId, durationMs);
      const hours = Math.round(durationMs / (60 * 60 * 1000));
      toast.info(hours < 24 ? `${hours}時間スヌーズ` : "スヌーズ設定");
      const idx = filtered.findIndex((a) => a.id === snoozeTargetId);
      const next = filtered[idx + 1];
      if (next) setSelectedArticle(next);
    },
    [snoozeTargetId, snoozeArticle, toast, filtered, setSelectedArticle],
  );

  return { snoozeArticleTitle, handleSnooze };
}
