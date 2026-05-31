"use client";

import { useCallback, useState } from "react";
import type { RecommendedFeed, UserProfile } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { useAsyncFetch } from "./useAsyncFetch";

interface UseRecommendationsResult {
  recommendations: RecommendedFeed[];
  loading: boolean;
  error: string | null;
  dismiss: (id: string) => void;
  refresh: () => void;
  refreshing: boolean;
}

/**
 * #839: `useAsyncFetch<T>` で auto-fetch + loading + error ボイラープレートを集約。
 *
 * 多段 fetch (`/api/recommendations` が 204 → POST `/refresh` fallback) は custom `fetcher` で実装。
 * `dismiss` / `refresh` は `setData` 経由で楽観的更新する。`refreshing` は独立 state で維持。
 */
export function useRecommendations(user: UserProfile | null | undefined): UseRecommendationsResult {
  const [refreshing, setRefreshing] = useState(false);

  const triggerRefresh = useCallback(async (): Promise<RecommendedFeed[]> => {
    const res = await apiFetch("/api/recommendations/refresh", { method: "POST" });
    if (!res.ok) return [];
    const data = (await res.json()) as { recommendations?: RecommendedFeed[] };
    return data.recommendations ?? [];
  }, []);

  const {
    data: recommendations,
    loading,
    error,
    setData: setRecommendations,
    setError,
  } = useAsyncFetch<RecommendedFeed[]>(user ? "/api/recommendations" : null, {
    auto: true,
    deps: [user],
    initialData: [],
    formatError: () => "推薦の読み込みに失敗しました",
    fetcher: async (endpoint, signal) => {
      const res = await apiFetch(endpoint, { signal });
      if (res.status === 204) {
        return await triggerRefresh().catch(() => []);
      }
      if (!res.ok) throw new Error("推薦の読み込みに失敗しました");
      const data = (await res.json()) as { recommendations?: RecommendedFeed[] };
      return data.recommendations ?? [];
    },
  });

  const dismiss = useCallback(
    (id: string) => {
      setRecommendations((prev) => (prev ?? []).filter((r) => r.id !== id));
      apiFetch("/api/recommendations/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch((err: unknown) => {
        devError("[useRecommendations] dismiss failed", err);
      });
    },
    [setRecommendations],
  );

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const items = await triggerRefresh();
      setRecommendations(items);
      setError(null);
    } catch (err) {
      devError("[useRecommendations] refresh failed", err);
      setError("推薦の読み込みに失敗しました");
    } finally {
      setRefreshing(false);
    }
  }, [triggerRefresh, setRecommendations, setError]);

  return {
    recommendations: recommendations ?? [],
    loading,
    error,
    dismiss,
    refresh,
    refreshing,
  };
}
