"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecommendedFeed, UserProfile } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { useAsyncFetch } from "./useAsyncFetch";

interface UseRecommendationsResult {
  recommendations: RecommendedFeed[];
  topics: string[];
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

  // 初期表示 critical path から除外するため、fetch trigger を initial paint 後まで defer。
  // 推薦は sidebar section (常時表示) だが「推薦を再取得」等の user action まで空リストで
  // 十分 (default empty[] を useAsyncFetch initialData で保証済)、initial network cost を
  // Piper wasm chunk 除外と同 pattern で critical path から除外する。
  const [deferReady, setDeferReady] = useState(false);
  useEffect(() => {
    if (!user) {
      setDeferReady(false);
      return;
    }
    const id = setTimeout(() => setDeferReady(true), 0);
    return () => clearTimeout(id);
  }, [user]);

  const triggerRefresh = useCallback(async (): Promise<{
    recommendations: RecommendedFeed[];
    topics: string[];
  }> => {
    const res = await apiFetch("/api/recommendations/refresh", { method: "POST" });
    if (!res.ok) return { recommendations: [], topics: [] };
    const data = (await res.json()) as { recommendations?: RecommendedFeed[]; topics?: string[] };
    return { recommendations: data.recommendations ?? [], topics: data.topics ?? [] };
  }, []);

  const {
    data: recommendationData,
    loading,
    error,
    setData: setRecommendations,
    setError,
  } = useAsyncFetch<{ recommendations: RecommendedFeed[]; topics: string[] }>(
    user && deferReady ? "/api/recommendations" : null,
    {
      auto: true,
      deps: [user, deferReady],
      initialData: { recommendations: [], topics: [] },
      formatError: () => "推薦の読み込みに失敗しました",
      fetcher: async (endpoint, signal) => {
        const res = await apiFetch(endpoint, { signal });
        if (res.status === 204) {
          return await triggerRefresh().catch(() => ({ recommendations: [], topics: [] }));
        }
        if (!res.ok) throw new Error("推薦の読み込みに失敗しました");
        const data = (await res.json()) as {
          recommendations?: RecommendedFeed[];
          topics?: string[];
        };
        return { recommendations: data.recommendations ?? [], topics: data.topics ?? [] };
      },
    },
  );

  const dismiss = useCallback(
    (id: string) => {
      setRecommendations((prev) => ({
        recommendations: (prev?.recommendations ?? []).filter((r) => r.id !== id),
        topics: prev?.topics ?? [],
      }));
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
      const data = await triggerRefresh();
      setRecommendations(data);
      setError(null);
    } catch (err) {
      devError("[useRecommendations] refresh failed", err);
      setError("推薦の読み込みに失敗しました");
    } finally {
      setRefreshing(false);
    }
  }, [triggerRefresh, setRecommendations, setError]);

  return {
    recommendations: recommendationData?.recommendations ?? [],
    topics: recommendationData?.topics ?? [],
    loading,
    error,
    dismiss,
    refresh,
    refreshing,
  };
}
