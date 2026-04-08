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

/**
 * フィード推薦取得フック。
 *
 * `/api/recommendations` から推薦フィード一覧を取得する。
 * 推薦結果は R2 に 24 時間キャッシュされ、Workers AI でエンゲージメント履歴を分析して生成される。
 * `user` が未ログインの場合はフェッチしない。
 * `dismiss(id)` で特定の推薦を非表示にし、`refresh()` でキャッシュを破棄して再生成する。
 */
export function useRecommendations(user: UserProfile | null | undefined): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<RecommendedFeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
