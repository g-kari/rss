"use client";

import { useMemo } from "react";
import type { Article, Feed } from "../types";
import { isArticleRead } from "../lib/article-filter";
import { computeFeedStructuralSignature } from "../lib/feed-signature";

export interface InboxFeedStat {
  feedId: string;
  title: string;
  total: number;
  unread: number;
  /** 0.0〜1.0 */
  readRatio: number;
}

/**
 * フィード別の未読消化率を計算して返す。
 * 未読数が多い順にソートし、最大 10 件に絞る。
 */
export function useInboxProgress(
  articles: Article[],
  feeds: Feed[],
  readIds: Set<string>,
  readBeforeTimestamp: string | null,
): InboxFeedStat[] {
  // perf: feeds の reference がポーリングで変わるたびに O(n_articles) 再計算が走るのを抑制する。
  // feedStructuralSignature が変化したときのみ feedMap を再構築し、
  // articles スキャンの useMemo の deps は feedMap に置く。
  const feedStructuralSignature = useMemo(() => computeFeedStructuralSignature(feeds), [feeds]);

  const feedMap = useMemo(
    () => new Map(feeds.map((f) => [f.id, f.title])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feeds の内容変化のみ追跡
    [feedStructuralSignature],
  );

  return useMemo(() => {
    const totals = new Map<string, number>();
    const unreads = new Map<string, number>();

    for (const a of articles) {
      const fid = a.feedHash;
      totals.set(fid, (totals.get(fid) ?? 0) + 1);
      if (!isArticleRead(a, readIds, readBeforeTimestamp)) {
        unreads.set(fid, (unreads.get(fid) ?? 0) + 1);
      }
    }

    const stats: InboxFeedStat[] = [];
    for (const [feedId, total] of totals) {
      const unread = unreads.get(feedId) ?? 0;
      stats.push({
        feedId,
        title: feedMap.get(feedId) ?? feedId.slice(0, 12) + "…",
        total,
        unread,
        readRatio: total === 0 ? 1 : (total - unread) / total,
      });
    }

    // 未読数が多い順にソート、同数なら未読率が低い順
    return stats.sort((a, b) => b.unread - a.unread || a.readRatio - b.readRatio).slice(0, 10);
  }, [articles, feedMap, readIds, readBeforeTimestamp]);
}
