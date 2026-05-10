import { useMemo } from "react";
import type { Feed, FeedGroup, FeedView } from "../types";
import { useUnreadStats } from "../contexts/UnreadStatsContext";

interface UseSidebarFeedsInput {
  feeds: Feed[];
  articleTagIds?: Record<string, string[]>;
  pinnedFeedIds: Set<string>;
  feedSearch: string;
  feedGroups?: FeedGroup[];
  activeFeedView: FeedView;
  nsfwMode: boolean;
}

interface UseSidebarFeedsResult {
  tagCounts: Map<string, number>;
  sortedTags: Array<[string, number]>;
  unreadByFeed: Map<string, number>;
  totalUnread: number;
  lastPublishedByFeed: Map<string, string>;
  readTodayCount: number;
  pinnedFeeds: Feed[];
  groupedFeeds: Array<{ group: FeedGroup; feeds: Feed[] }>;
  categoryGroups: Array<[string, Feed[]]>;
  uncategorizedFeeds: Feed[];
}

export function useSidebarFeeds({
  feeds,
  articleTagIds,
  pinnedFeedIds,
  feedSearch,
  feedGroups,
  activeFeedView,
  nsfwMode,
}: UseSidebarFeedsInput): UseSidebarFeedsResult {
  // #702: 旧実装は articles full scan を独自に行っていたが、App.tsx で
  // useArticleUnreadStats を 1 回計算 → UnreadStatsProvider 経由で配信する形に統合。
  // 二重 scan が解消される。
  const { unreadByFeed, totalUnread, lastPublishedByFeed, readTodayCount } = useUnreadStats();

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!articleTagIds) return map;
    for (const tags of Object.values(articleTagIds)) {
      for (const t of tags) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [articleTagIds]);

  const sortedTags = useMemo(() => {
    const arr = [...tagCounts.entries()];
    arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return arr;
  }, [tagCounts]);

  const { pinnedFeeds, groupedFeeds, categoryGroups, uncategorizedFeeds } = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    const matchFeed = (f: Feed) => !q || (f.title || f.url).toLowerCase().includes(q);
    const matchView = (f: Feed) =>
      activeFeedView === "articles" ? !f.view || f.view === "articles" : f.view === activeFeedView;
    const matchNsfw = (f: Feed) => nsfwMode || !f.nsfw;
    const pinned = feeds.filter(
      (f) => pinnedFeedIds.has(f.id) && matchView(f) && matchFeed(f) && matchNsfw(f),
    );
    const unpinned = feeds
      .filter((f) => !pinnedFeedIds.has(f.id) && matchView(f) && matchFeed(f) && matchNsfw(f))
      .sort((a, b) => {
        const aHigh = a.priority === "high" ? 0 : 1;
        const bHigh = b.priority === "high" ? 0 : 1;
        return aHigh - bHigh;
      });

    const validGroupIds = new Set((feedGroups ?? []).map((g) => g.id));
    const byGroup = new Map<string, Feed[]>();
    const notGrouped: Feed[] = [];
    for (const feed of unpinned) {
      if (feed.groupId && validGroupIds.has(feed.groupId)) {
        const arr = byGroup.get(feed.groupId) ?? [];
        arr.push(feed);
        byGroup.set(feed.groupId, arr);
      } else {
        notGrouped.push(feed);
      }
    }
    const grouped = (feedGroups ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ group: g, feeds: byGroup.get(g.id) ?? [] }));

    const catMap = new Map<string, Feed[]>();
    const uncategorized: Feed[] = [];
    for (const feed of notGrouped) {
      if (feed.category) {
        const group = catMap.get(feed.category) ?? [];
        group.push(feed);
        catMap.set(feed.category, group);
      } else {
        uncategorized.push(feed);
      }
    }
    const sorted = [...catMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "ja", { sensitivity: "base" }),
    );
    return {
      pinnedFeeds: pinned,
      groupedFeeds: grouped,
      categoryGroups: sorted,
      uncategorizedFeeds: uncategorized,
    };
  }, [feeds, pinnedFeedIds, feedSearch, feedGroups, activeFeedView, nsfwMode]);

  return {
    tagCounts,
    sortedTags,
    unreadByFeed,
    totalUnread,
    lastPublishedByFeed,
    readTodayCount,
    pinnedFeeds,
    groupedFeeds,
    categoryGroups,
    uncategorizedFeeds,
  };
}
