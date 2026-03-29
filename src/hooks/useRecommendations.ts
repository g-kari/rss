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

  /** 推薦データを取得して state にセットする（ローディング状態管理なし） */
  const loadRecommendations = useCallback(async () => {
    const res = await apiFetch("/api/recommendations");
    if (!res.ok) return;
    const data = (await res.json()) as { recommendations: RecommendedFeed[] };
    setRecommendations(data.recommendations ?? []);
  }, []);

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
      await apiFetch("/api/recommendations/refresh", { method: "POST" });
      await loadRecommendations();
    } catch {
      // 静かに失敗
    } finally {
      setRefreshing(false);
    }
  }, [loadRecommendations]);

  return { recommendations, loading, dismiss, refresh, refreshing };
}
