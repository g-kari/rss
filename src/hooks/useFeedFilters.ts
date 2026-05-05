import { useMemo } from "react";
import type { Feed, FeedGroup } from "../types";

export function useFeedFilters(
  feeds: Feed[],
  feedGroups: FeedGroup[],
  selectedGroupId: string | null,
) {
  const nsfwFeedIds = useMemo(() => new Set(feeds.filter((f) => f.nsfw).map((f) => f.id)), [feeds]);

  // 選択中グループに所属するフィード ID セット — useFilteredArticles / markBulkRead 等で共有
  const groupFeedIds = useMemo(() => {
    if (!selectedGroupId) return undefined;
    const ids = new Set<string>();
    for (const f of feeds) if (f.groupId === selectedGroupId) ids.add(f.id);
    return ids;
  }, [selectedGroupId, feeds]);

  const mutedFeedIds = useMemo(() => {
    const now = new Date().toISOString();
    const ids = new Set<string>();
    for (const f of feeds) {
      if (f.mutedUntil && f.mutedUntil > now) ids.add(f.id);
    }
    // グループミュート: muted グループに所属するフィードを追加で除外
    const mutedGroupIds = new Set(feedGroups.filter((g) => g.muted).map((g) => g.id));
    if (mutedGroupIds.size > 0) {
      for (const f of feeds) {
        if (f.groupId && mutedGroupIds.has(f.groupId)) ids.add(f.id);
      }
    }
    return ids;
  }, [feeds, feedGroups]);

  return { nsfwFeedIds, groupFeedIds, mutedFeedIds };
}
