"use client";

import { useMemo } from "react";
import type { Article } from "../types";
import { isArticleRead } from "../lib/article-filter";
import { useDebounce } from "./useDebounce";

export interface ArticleUnreadStats {
  /** feedHash → 未読件数 */
  unreadByFeed: Map<string, number>;
  /** 全フィードの未読合計 */
  totalUnread: number;
  /** feedHash → 最新 publishedAt (ISO 文字列) */
  lastPublishedByFeed: Map<string, string>;
  /** 今日 (UTC) に既読化された記事件数 */
  readTodayCount: number;
}

/**
 * 全記事の未読統計を 1 回だけ scan で計算する hook (#702 案 A)。
 *
 * 旧実装では `useTotalUnreadCount` (App.tsx) と `useSidebarFeeds` 内の useMemo
 * が同じ `articles` 配列を独立 full scan していたため、`readIds` 変化のたび
 * 2 回 scan が走っていた。本 hook で 1 回計算 → Context で配信して二重 scan を解消する。
 *
 * **debounce 200ms**:
 * `readIds` / `readBeforeTimestamp` を 200ms デバウンスして、連続した既読操作
 * (j キー連打など) で `articles.filter()` が毎フレーム走るのを抑制。
 * サイドバーの未読バッジも同じ debounce に合わせるため、200ms の表示遅延あり。
 */
export function useArticleUnreadStats(
  articles: Article[],
  readIds: Set<string>,
  readBeforeTimestamp: string | null,
): ArticleUnreadStats {
  const debouncedReadIds = useDebounce(readIds, 200);
  const debouncedReadBeforeTimestamp = useDebounce(readBeforeTimestamp, 200);

  return useMemo(() => {
    const byFeed = new Map<string, number>();
    const lastPublished = new Map<string, string>();
    const today = new Date().toISOString().slice(0, 10);
    let total = 0;
    let todayRead = 0;
    for (const a of articles) {
      if (!isArticleRead(a, debouncedReadIds, debouncedReadBeforeTimestamp)) {
        byFeed.set(a.feedHash, (byFeed.get(a.feedHash) ?? 0) + 1);
        total++;
      } else if (a.publishedAt?.slice(0, 10) === today) {
        todayRead++;
      }
      if (a.publishedAt) {
        const prev = lastPublished.get(a.feedHash);
        if (!prev || a.publishedAt > prev) {
          lastPublished.set(a.feedHash, a.publishedAt);
        }
      }
    }
    return {
      unreadByFeed: byFeed,
      totalUnread: total,
      lastPublishedByFeed: lastPublished,
      readTodayCount: todayRead,
    };
  }, [articles, debouncedReadIds, debouncedReadBeforeTimestamp]);
}
