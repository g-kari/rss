"use client";

import { useEffect, useMemo, useState } from "react";
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

/** 現在の UTC 日付 (`YYYY-MM-DD` 形式) を返す。 */
function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * UTC 日付が変わるタイミング (午前 0:00 UTC) で再 render する hook。
 *
 * `new Date()` を useMemo 内で呼ぶと「memo 作成時の日付」がキャプチャされ、
 * tab を開きっぱなしで日付を跨いだとき `readTodayCount` が前日基準で stale になる
 * (perf 監査 37th cycle, confidence 82%)。midnight でのみ state 更新するため
 * 通常の render 負荷はほぼゼロ。
 */
function useUtcDate(): string {
  const [date, setDate] = useState(currentUtcDate);
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const id = setTimeout(() => setDate(currentUtcDate()), msUntilMidnight + 1000);
    return () => clearTimeout(id);
  }, [date]);
  return date;
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
 *
 * **memo 分離 (perf 監査 37th cycle #2)**:
 * `lastPublishedByFeed` は `articles` のみに依存するため、`readIds` 変化で再計算
 * しないよう別 useMemo に分離。`unreadByFeed` / `totalUnread` / `readTodayCount` は
 * `readIds` / `readBeforeTimestamp` 変化時のみ再計算する。
 */
export function useArticleUnreadStats(
  articles: Article[],
  readIds: Set<string>,
  readBeforeTimestamp: string | null,
): ArticleUnreadStats {
  const debouncedReadIds = useDebounce(readIds, 200);
  const debouncedReadBeforeTimestamp = useDebounce(readBeforeTimestamp, 200);
  const today = useUtcDate();

  // articles のみ依存: feedHash → 最新 publishedAt
  // readIds 変化 (j キー連打 / mark-all-read) では再計算しない
  const lastPublishedByFeed = useMemo(() => {
    const lastPublished = new Map<string, string>();
    for (const a of articles) {
      if (!a.publishedAt) continue;
      const prev = lastPublished.get(a.feedHash);
      if (!prev || a.publishedAt > prev) {
        lastPublished.set(a.feedHash, a.publishedAt);
      }
    }
    return lastPublished;
  }, [articles]);

  // articles + debouncedReadIds + debouncedReadBeforeTimestamp + today 依存
  const { unreadByFeed, totalUnread, readTodayCount } = useMemo(() => {
    const byFeed = new Map<string, number>();
    let total = 0;
    let todayRead = 0;
    for (const a of articles) {
      if (!isArticleRead(a, debouncedReadIds, debouncedReadBeforeTimestamp)) {
        byFeed.set(a.feedHash, (byFeed.get(a.feedHash) ?? 0) + 1);
        total++;
      } else if (a.publishedAt?.slice(0, 10) === today) {
        todayRead++;
      }
    }
    return {
      unreadByFeed: byFeed,
      totalUnread: total,
      readTodayCount: todayRead,
    };
  }, [articles, debouncedReadIds, debouncedReadBeforeTimestamp, today]);

  return useMemo(
    () => ({ unreadByFeed, totalUnread, lastPublishedByFeed, readTodayCount }),
    [unreadByFeed, totalUnread, lastPublishedByFeed, readTodayCount],
  );
}
