"use client";

import { useCallback, useState } from "react";
import type { EngagementEntry } from "../types";
import { apiFetch } from "../lib/api-fetch";

/**
 * `/api/engagement` の entries を取得する lazy fetch フック。
 * フィード別ドリルダウン用にクライアントサイド集計するための生エントリを返す。
 */
export function useEngagementEntries(): {
  entries: EngagementEntry[] | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
} {
  const [entries, setEntries] = useState<EngagementEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/engagement");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: EngagementEntry[] };
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, error, fetch: doFetch };
}
