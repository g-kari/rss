"use client";

import { useState, useEffect, useCallback } from "react";
import type { RecommendedFeed, UserProfile } from "../types";
import { apiFetch } from "../lib/api-fetch";

interface UseRecommendationsResult {
  recommendations: RecommendedFeed[];
  loading: boolean;
  dismiss: (id: string) => void;
  refresh: () => void;
  refreshing: boolean;
}

export function useRecommendations(user: UserProfile | null | undefined): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<RecommendedFeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const triggerRefresh = useCallback(async (): Promise<RecommendedFeed[]> => {
    const res = await apiFetch("/api/recommendations/refresh", { method: "POST" });
    if (!res.ok) return [];
    const data = (await res.json()) as { recommendations?: RecommendedFeed[] };
    return data.recommendations ?? [];
  }, []);

  const loadRecommendations = useCallback(async () => {
    const res = await apiFetch("/api/recommendations");
    if (res.status === 204) {
      // 未生成 or 期限切れ → 自動でリフレッシュを試みる
      const items = await triggerRefresh().catch(() => []);
      setRecommendations(items);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { recommendations: RecommendedFeed[] };
    setRecommendations(data.recommendations ?? []);
  }, [triggerRefresh]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    loadRecommendations()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, loadRecommendations]);

  const dismiss = useCallback((id: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    apiFetch("/api/recommendations/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const items = await triggerRefresh();
      setRecommendations(items);
    } catch {
      // 静かに失敗
    } finally {
      setRefreshing(false);
    }
  }, [triggerRefresh]);

  return { recommendations, loading, dismiss, refresh, refreshing };
}
