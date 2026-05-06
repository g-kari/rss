"use client";

import { useCallback } from "react";
import type { Feed, FeedPatchPayload, FeedView, KeywordFilter } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { isFeed } from "../lib/type-guards";

export interface FeedPatchActions {
  patchFeed: (id: string, body: FeedPatchPayload) => Promise<Feed | null>;
  toggleNsfwFeed: (feed: Feed) => Promise<Feed | null>;
  togglePriorityFeed: (feed: Feed) => Promise<Feed | null>;
  setCategoryFeed: (feed: Feed, category: string | null) => Promise<void>;
  setGroupFeed: (feed: Feed, groupId: string | null) => Promise<void>;
  muteFeed: (feed: Feed, mutedUntil: string | null) => Promise<void>;
  setFeedView: (feed: Feed, view: FeedView | null) => Promise<void>;
  saveFilter: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
  setDigestLimit: (feed: Feed, limit: number | null) => Promise<void>;
}

export function useFeedPatch(updateFeed: (feed: Feed) => void): FeedPatchActions {
  const patchFeed = useCallback(
    async (id: string, body: FeedPatchPayload): Promise<Feed | null> => {
      const res = await apiFetch(`/api/feeds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      return isFeed(data) ? data : null;
    },
    [],
  );

  const applyFeedPatch = useCallback(
    async (id: string, patch: FeedPatchPayload): Promise<Feed | null> => {
      const updated = await patchFeed(id, patch);
      if (updated) updateFeed(updated);
      return updated;
    },
    [patchFeed, updateFeed],
  );

  const toggleNsfwFeed = useCallback(
    (feed: Feed) => applyFeedPatch(feed.id, { nsfw: !feed.nsfw }),
    [applyFeedPatch],
  );

  const togglePriorityFeed = useCallback(
    (feed: Feed) => applyFeedPatch(feed.id, { priority: feed.priority === "high" ? null : "high" }),
    [applyFeedPatch],
  );

  const setCategoryFeed = useCallback(
    async (feed: Feed, category: string | null) => {
      await applyFeedPatch(feed.id, { category });
    },
    [applyFeedPatch],
  );

  const setGroupFeed = useCallback(
    async (feed: Feed, groupId: string | null) => {
      await applyFeedPatch(feed.id, { groupId });
    },
    [applyFeedPatch],
  );

  const muteFeed = useCallback(
    async (feed: Feed, mutedUntil: string | null) => {
      await applyFeedPatch(feed.id, { mutedUntil });
    },
    [applyFeedPatch],
  );

  const setFeedView = useCallback(
    async (feed: Feed, view: FeedView | null) => {
      await applyFeedPatch(feed.id, { view });
    },
    [applyFeedPatch],
  );

  const saveFilter = useCallback(
    async (feedId: string, filter: KeywordFilter | null) => {
      const updated = await applyFeedPatch(feedId, { filter });
      if (!updated) throw new Error("フィルターの保存に失敗しました");
    },
    [applyFeedPatch],
  );

  const setDigestLimit = useCallback(
    async (feed: Feed, limit: number | null) => {
      await applyFeedPatch(feed.id, { digestLimit: limit });
    },
    [applyFeedPatch],
  );

  return {
    patchFeed,
    toggleNsfwFeed,
    togglePriorityFeed,
    setCategoryFeed,
    setGroupFeed,
    muteFeed,
    setFeedView,
    saveFilter,
    setDigestLimit,
  };
}
