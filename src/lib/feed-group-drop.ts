import type { Feed } from "../types";

export interface FeedGroupDropResolution {
  feed: Feed;
  targetGroupId: string | null;
}

export function resolveFeedGroupDrop(
  feedId: string,
  targetGroupId: string | null,
  feeds: Feed[],
): FeedGroupDropResolution | null {
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) return null;
  if ((feed.groupId ?? null) === targetGroupId) return null;
  return { feed, targetGroupId };
}
