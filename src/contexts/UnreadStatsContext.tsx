"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ArticleUnreadStats } from "../hooks/useArticleUnreadStats";

const UnreadStatsContext = createContext<ArticleUnreadStats | null>(null);

interface ProviderProps {
  value: ArticleUnreadStats;
  children: ReactNode;
}

/**
 * 全記事の未読統計を子コンポーネントツリー全体に配信する Provider (#702)。
 *
 * App.tsx で `useArticleUnreadStats(articles, readIds, readBeforeTimestamp)` を
 * 1 回だけ呼んでこの Provider に注入する。`useDocumentTitleBadge` (App.tsx 直下)
 * も `useSidebarFeeds` 経由の `<FeedSidebar>` も同一インスタンスを共有するため、
 * articles の二重 scan を解消できる。
 */
export function UnreadStatsProvider({ value, children }: ProviderProps) {
  return <UnreadStatsContext value={value}>{children}</UnreadStatsContext>;
}

export function useUnreadStats(): ArticleUnreadStats {
  const ctx = useContext(UnreadStatsContext);
  if (!ctx) throw new Error("useUnreadStats must be used within UnreadStatsProvider");
  return ctx;
}
