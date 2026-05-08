"use client";

import { useState, useEffect, useCallback } from "react";
import type { RecommendedFeed, UserProfile } from "../types";
import { apiFetch } from "../lib/api-fetch";

interface UseRecommendationsResult {
  recommendations: RecommendedFeed[];
  loading: boolean;
  error: string | null;
  dismiss: (id: string) => void;
  refresh: () => void;
  refreshing: boolean;
}

export function useRecommendations(user: UserProfile | null | undefined): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<RecommendedFeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerRefresh = useCallback(async (): Promise<RecommendedFeed[]> => {
    const res = await apiFetch("/api/recommendations/refresh", { method: "POST" });
    if (!res.ok) return [];
    const data = (await res.json()) as { recommendations?: RecommendedFeed[] };
    return data.recommendations ?? [];
  }, []);

  const loadRecommendations = useCallback(async () => {
    const res = await apiFetch("/api/recommendations");
    if (res.status === 204) {
      const items = await triggerRefresh().catch(() => []);
      setRecommendations(items);
      setError(null);
      return;
    }
    if (!res.ok) {
      setError("推薦の読み込みに失敗しました");
      return;
    }
    const data = (await res.json()) as { recommendations: RecommendedFeed[] };
    setRecommendations(data.recommendations ?? []);
    setError(null);
  }, [triggerRefresh]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    loadRecommendations()
      .catch(() => {
        setError("推薦の読み込みに失敗しました");
      })
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
      setError(null);
    } catch {
      setError("推薦の読み込みに失敗しました");
    } finally {
      setRefreshing(false);
    }
  }, [triggerRefresh]);

  return { recommendations, loading, error, dismiss, refresh, refreshing };
}
