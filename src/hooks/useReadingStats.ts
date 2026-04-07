"use client";

import { useState, useCallback } from "react";
import type { ReadingStats } from "../../app/api/stats/route";

interface UseReadingStatsResult {
  stats: ReadingStats | null;
  loading: boolean;
  error: string | null;
  fetch: () => void;
}

export function useReadingStats(): UseReadingStatsResult {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/stats")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ReadingStats>;
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "エラー");
        setLoading(false);
      });
  }, []);

  return { stats, loading, error, fetch: fetchStats };
}
