"use client";

import type { ReadingStats } from "../../app/api/stats/route";
import { useAsyncFetch } from "./useAsyncFetch";

interface UseReadingStatsResult {
  stats: ReadingStats | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

/**
 * 読了統計取得フック。
 *
 * `/api/stats` から `ReadingStats`（日別カウント・年間ヒートマップ・フィード別統計）を取得する。
 * 初回マウント時は fetch しない（呼び出し側が `fetch()` を明示的に呼ぶ必要がある）。
 *
 * #839: `useAsyncFetch<T>` で loading + error + try/finally ボイラープレートを集約。
 */
export function useReadingStats(): UseReadingStatsResult {
  const {
    data: stats,
    loading,
    error,
    refetch,
  } = useAsyncFetch<ReadingStats>("/api/stats", {
    formatError: (e) => (e instanceof Error ? e.message : "エラー"),
  });

  return {
    stats,
    loading,
    error,
    fetch: refetch,
  };
}
