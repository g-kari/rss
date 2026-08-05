import { useMemo, useRef } from "react";
import type { Feed, FeedGroup, FeedView } from "../types";
import { useUnreadStats } from "../contexts/UnreadStatsContext";
import { sortByOrder } from "../lib/sort-utils";
import { computeArticleTagIdsSignature } from "../lib/feed-signature";
import { useFeedStructuralSignature } from "./useFeedStructuralSignature";

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

  // `useReadStateTags` の `setTagIdsState` が 2 秒 debounce flush ごとに新 reference を
  // 生成するが、内容変化なしなら signature 一致で tagCounts O(N×M) 全走査を skip。
  // 同 file の `feedStructuralSignature` 既使用 canonical pattern と完全対称
  // (`react-state-ref.md § 派生「signature string」`)。
  const articleTagIdsSignature = useMemo(
    () => (articleTagIds ? computeArticleTagIdsSignature(articleTagIds) : ""),
    [articleTagIds],
  );
  const articleTagIdsRef = useRef(articleTagIds);
  articleTagIdsRef.current = articleTagIds;

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    const current = articleTagIdsRef.current;
    if (!current) return map;
    for (const tags of Object.values(current)) {
      for (const t of tags) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- articleTagIdsSignature が内容を encode 済、articleTagIdsRef は ref 安定参照
  }, [articleTagIdsSignature]);

  const sortedTags = useMemo(() => {
    const arr = [...tagCounts.entries()];
    arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return arr;
  }, [tagCounts]);

  // #747: feeds の構造的内容を signature 化して下流 useMemo の deps に使う。
  // 5 分 polling で `feeds` reference が新規でも内容変化なしなら signature 同じ → useMemo skip。
  // signature 計算は N feeds × 数文字 concat で軽量 (1000 feeds でも < 1ms)。
  const feedStructuralSignature = useFeedStructuralSignature(feeds);

  // useMemo の deps から feeds を外して signature に置換。
  // feeds reference は useMemo の closure 経由でアクセスするため、内側ロジックは変更不要。
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- feedStructuralSignature が feeds 構造を encode 済。feedsRef は ref 安定参照
  const { pinnedFeeds, groupedFeeds, categoryGroups, uncategorizedFeeds } = useMemo(() => {
    const feeds = feedsRef.current; // 構造的等価ガード後の安定 reference を採用
    const q = feedSearch.trim().toLowerCase();
    const matchFeed = (f: Feed) => !q || (f.title || f.url).toLowerCase().includes(q);
    const matchView = (f: Feed) =>
      activeFeedView === "articles" ? !f.view || f.view === "articles" : f.view === activeFeedView;
    const matchNsfw = (f: Feed) => nsfwMode || !f.nsfw;
    const pinned: Feed[] = [];
    const unpinned: Feed[] = [];
    for (const feed of feeds) {
      if (!matchView(feed) || !matchFeed(feed) || !matchNsfw(feed)) continue;
      if (pinnedFeedIds.has(feed.id)) pinned.push(feed);
      else unpinned.push(feed);
    }
    unpinned.sort((a, b) => {
      const aHigh = a.priority === "high" ? 0 : 1;
      const bHigh = b.priority === "high" ? 0 : 1;
      return aHigh - bHigh;
    });

    const validGroupIds = new Set<string>();
    for (const group of feedGroups ?? []) validGroupIds.add(group.id);
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
    const grouped = sortByOrder(feedGroups ?? []).map((g) => ({
      group: g,
      feeds: byGroup.get(g.id) ?? [],
    }));

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
  }, [feedStructuralSignature, pinnedFeedIds, feedSearch, feedGroups, activeFeedView, nsfwMode]);

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
