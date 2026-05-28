"use client";

import type { EngagementEntry } from "../types";
import { useAsyncFetch } from "./useAsyncFetch";

/**
 * `/api/engagement` の entries を取得する lazy fetch フック。
 * フィード別ドリルダウン用にクライアントサイド集計するための生エントリを返す。
 *
 * #839: `useAsyncFetch<T>` で loading + error + try/finally ボイラープレートを集約。
 */
export function useEngagementEntries(): {
  entries: EngagementEntry[] | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
} {
  const {
    data: entries,
    loading,
    error,
    refetch,
  } = useAsyncFetch<EngagementEntry[]>("/api/engagement", {
    transform: (raw) => (raw as { entries?: EngagementEntry[] }).entries ?? [],
  });

  return { entries, loading, error, fetch: refetch };
}
