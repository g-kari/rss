"use client";

import { useCallback } from "react";
import type { Feed, FeedPatchPayload, FeedView, KeywordFilter } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
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

/**
 * フィードの部分更新 (PATCH) callback 群を提供する hook。NSFW / priority / category / group 等の toggle/setter を集約。
 * @returns `FeedPatchActions` (`{ patchFeed, toggleNsfwFeed, togglePriorityFeed, setCategoryFeed, setGroupFeed, ... }`)
 */
export function useFeedPatch(
  updateFeed: (feed: Feed) => void,
  onError?: (msg: string) => void,
): FeedPatchActions {
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

  /**
   * 楽観的更新パターン:
   * 1. optimisticFeed でローカル state を即時更新（サーバー応答を待たない）
   * 2. PATCH リクエストを送信
   * 3. 成功時はサーバー応答で確定 / 失敗時は元の feed にロールバック + onError 通知
   */
  const applyFeedPatchOptimistic = useCallback(
    async (feed: Feed, optimisticFeed: Feed, patch: FeedPatchPayload): Promise<Feed | null> => {
      // 楽観的更新
      updateFeed(optimisticFeed);
      try {
        const updated = await patchFeed(feed.id, patch);
        if (updated) {
          // サーバー応答で確定（楽観的更新との差分を解消）
          updateFeed(updated);
          return updated;
        }
        // res.ok=false の場合はロールバック + ユーザー通知
        updateFeed(feed);
        onError?.("変更の保存に失敗しました");
        return null;
      } catch (err) {
        devError("[useFeedPatch] patch failed:", err);
        // エラーはロールバック + ユーザー通知
        updateFeed(feed);
        onError?.("変更の保存に失敗しました");
        return null;
      }
    },
    [patchFeed, updateFeed, onError],
  );

  const toggleNsfwFeed = useCallback(
    (feed: Feed) =>
      applyFeedPatchOptimistic(feed, { ...feed, nsfw: !feed.nsfw }, { nsfw: !feed.nsfw }),
    [applyFeedPatchOptimistic],
  );

  const togglePriorityFeed = useCallback(
    (feed: Feed) => {
      const newPriority: "high" | null = feed.priority === "high" ? null : "high";
      const optimisticFeed: Feed = {
        ...feed,
        priority: newPriority === "high" ? "high" : undefined,
      };
      return applyFeedPatchOptimistic(feed, optimisticFeed, { priority: newPriority });
    },
    [applyFeedPatchOptimistic],
  );

  const setCategoryFeed = useCallback(
    async (feed: Feed, category: string | null) => {
      await applyFeedPatchOptimistic(
        feed,
        { ...feed, category: category ?? undefined },
        {
          category,
        },
      );
    },
    [applyFeedPatchOptimistic],
  );

  const setGroupFeed = useCallback(
    async (feed: Feed, groupId: string | null) => {
      await applyFeedPatchOptimistic(feed, { ...feed, groupId: groupId ?? undefined }, { groupId });
    },
    [applyFeedPatchOptimistic],
  );

  const muteFeed = useCallback(
    async (feed: Feed, mutedUntil: string | null) => {
      await applyFeedPatchOptimistic(
        feed,
        { ...feed, mutedUntil: mutedUntil ?? undefined },
        { mutedUntil },
      );
    },
    [applyFeedPatchOptimistic],
  );

  const setFeedView = useCallback(
    async (feed: Feed, view: FeedView | null) => {
      await applyFeedPatchOptimistic(feed, { ...feed, view: view ?? undefined }, { view });
    },
    [applyFeedPatchOptimistic],
  );

  const saveFilter = useCallback(
    async (feedId: string, filter: KeywordFilter | null) => {
      // saveFilter はフィードオブジェクトなしで呼ばれるため楽観的更新なし（サーバー応答後に確定）
      const updated = await patchFeed(feedId, { filter });
      if (updated) {
        updateFeed(updated);
      } else {
        throw new Error("フィルターの保存に失敗しました");
      }
    },
    [patchFeed, updateFeed],
  );

  const setDigestLimit = useCallback(
    async (feed: Feed, limit: number | null) => {
      await applyFeedPatchOptimistic(
        feed,
        { ...feed, digestLimit: limit ?? undefined },
        { digestLimit: limit },
      );
    },
    [applyFeedPatchOptimistic],
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
