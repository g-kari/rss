"use client";
import { useState, useEffect } from "react";
import type { UserProfile, EngagementEntry } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { scoreFeedEngagement, topScoredFeeds } from "../lib/engagement-score";

/**
 * ダイジェストモード向けに engagement score 順で並べたフィード ID 配列を取得する hook。`/api/engagement` から取得して memo 化。
 * @param user - ログイン中ユーザー (null / undefined のときは fetch を skip)
 * @returns engagement score 降順のフィード ID 配列
 */
export function useDigestFeedOrder(user: UserProfile | null | undefined): string[] {
  const [feedOrder, setFeedOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/engagement")
      .then((r) => r.json() as Promise<{ entries: EngagementEntry[] }>)
      .then(({ entries }) => {
        const scores = scoreFeedEngagement(entries);
        setFeedOrder(topScoredFeeds(scores, 50));
      })
      .catch((err) => {
        // /api/engagement 外部依存ラッパーの silent fail を DevTools で観測可能化
        // (browser-platform.md § silent fallback 禁止 規範対象判定軸 / canonical: browser-summarizer.ts)
        devError("[useDigestFeedOrder] engagement fetch failed", err);
      });
  }, [user]);

  return feedOrder;
}
