"use client";

import { useState, useEffect, useCallback } from "react";
import type { RecommendedFeed, UserProfile } from "../types";

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

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/recommendations");
      if (!res.ok) return;
      const data = (await res.json()) as { recommendations: RecommendedFeed[] };
      setRecommendations(data.recommendations ?? []);
    } catch {
      // 静かに失敗
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetchRecommendations();
  }, [user, fetchRecommendations]);

  const dismiss = useCallback((id: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    fetch("/api/recommendations/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetch("/api/recommendations/refresh", { method: "POST" });
      await fetchRecommendations();
    } catch {
      // 静かに失敗
    } finally {
      setRefreshing(false);
    }
  }, [fetchRecommendations]);

  return { recommendations, loading, dismiss, refresh, refreshing };
}
