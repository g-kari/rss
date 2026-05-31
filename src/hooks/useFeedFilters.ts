import { useMemo, useRef } from "react";
import type { Feed, FeedGroup } from "../types";
import { equalViewFeedIds } from "../lib/article-filter-equality";

/**
 * フィード一覧から派生する除外用 ID Set (NSFW / 選択グループ所属 / muted) を memo 化して返す hook。
 * @param feeds - 全フィード配列
 * @param feedGroups - 全フィードグループ配列 (グループ muted 判定用)
 * @param selectedGroupId - 選択中グループ ID (null なら groupFeedIds は undefined)
 * @returns `{ nsfwFeedIds, groupFeedIds, mutedFeedIds }` 各 Set<string>
 */
export function useFeedFilters(
  feeds: Feed[],
  feedGroups: FeedGroup[],
  selectedGroupId: string | null,
) {
  const nsfwFeedIdsRef = useRef<Set<string>>(new Set());
  const nsfwFeedIds = useMemo(() => {
    const next = new Set(feeds.filter((f) => f.nsfw).map((f) => f.id));
    if (equalViewFeedIds(nsfwFeedIdsRef.current, next)) return nsfwFeedIdsRef.current;
    nsfwFeedIdsRef.current = next;
    return next;
  }, [feeds]);

  // 選択中グループに所属するフィード ID セット — useFilteredArticles / markBulkRead 等で共有
  const groupFeedIds = useMemo(() => {
    if (!selectedGroupId) return undefined;
    const ids = new Set<string>();
    for (const f of feeds) if (f.groupId === selectedGroupId) ids.add(f.id);
    return ids;
  }, [selectedGroupId, feeds]);

  const mutedFeedIdsRef = useRef<Set<string>>(new Set());
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
    if (equalViewFeedIds(mutedFeedIdsRef.current, ids)) return mutedFeedIdsRef.current;
    mutedFeedIdsRef.current = ids;
    return ids;
  }, [feeds, feedGroups]);

  return { nsfwFeedIds, groupFeedIds, mutedFeedIds };
}
