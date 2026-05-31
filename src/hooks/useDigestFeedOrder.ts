"use client";
import type { UserProfile, EngagementEntry } from "../types";
import { devError } from "../lib/dev-log";
import { scoreFeedEngagement, topScoredFeeds } from "../lib/engagement-score";
import { useAsyncFetch } from "./useAsyncFetch";

/**
 * ダイジェストモード向けに engagement score 順で並べたフィード ID 配列を取得する hook。`/api/engagement` から取得して memo 化。
 * @param user - ログイン中ユーザー (null / undefined のときは fetch を skip)
 * @returns engagement score 降順のフィード ID 配列
 */
export function useDigestFeedOrder(user: UserProfile | null | undefined): string[] {
  const { data } = useAsyncFetch<string[]>(user ? "/api/engagement" : null, {
    auto: true,
    deps: [user?.id],
    transform: (raw: unknown) => {
      const { entries = [] } = raw as { entries?: EngagementEntry[] };
      return topScoredFeeds(scoreFeedEngagement(entries), 50);
    },
    onError: (msg) => devError("[useDigestFeedOrder] engagement fetch failed", msg),
  });
  return data ?? [];
}
