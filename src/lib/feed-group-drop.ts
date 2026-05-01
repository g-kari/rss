import type { Feed, FeedView } from "../types";

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

export interface FeedViewDropResolution {
  feed: Feed;
  targetView: FeedView | null;
}

export function resolveFeedViewDrop(
  feedId: string,
  targetView: FeedView,
  feeds: Feed[],
): FeedViewDropResolution | null {
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) return null;
  const currentView = feed.view ?? "articles";
  if (currentView === targetView) return null;
  return { feed, targetView: targetView === "articles" ? null : targetView };
}
