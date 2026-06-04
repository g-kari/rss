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
 *
 * #1087: 楽観的更新 / rollback / 成功確定はいずれも `mergeFeedFields` (field 単位マージ) で行う。
 * 旧実装は `updateFeed(feed)` (full Feed 置換) で rollback していたため、同一 feed の別フィールドの
 * 並行 PATCH を巻き戻していた。変更フィールドのみを最新 state にマージすれば clobber しない。
 * @param mergeFeedFields - 指定 feed の一部フィールドを最新 state にマージする setter
 * @returns `FeedPatchActions` (`{ patchFeed, toggleNsfwFeed, togglePriorityFeed, setCategoryFeed, setGroupFeed, ... }`)
 */
export function useFeedPatch(
  mergeFeedFields: (id: string, fields: Partial<Feed>) => void,
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
   * 楽観的更新パターン (field 単位マージで並行更新を clobber しない):
   * 1. optimisticFeed と feed の差分フィールドのみを最新 state にマージ
   * 2. PATCH リクエストを送信
   * 3. 成功時はサーバー応答の同フィールドで確定 / 失敗時は変更フィールドのみ元値に rollback + onError 通知
   */
  const applyFeedPatchOptimistic = useCallback(
    async (feed: Feed, optimisticFeed: Feed, patch: FeedPatchPayload): Promise<Feed | null> => {
      // 変更フィールド = optimisticFeed が feed と異なるキー。これだけをマージ/rollback 対象にする。
      const changedKeys = (Object.keys(optimisticFeed) as (keyof Feed)[]).filter(
        (k) => optimisticFeed[k] !== feed[k],
      );
      const pick = (src: Feed): Partial<Feed> =>
        Object.fromEntries(changedKeys.map((k) => [k, src[k]])) as Partial<Feed>;

      // 楽観的更新 (変更フィールドのみ最新 state にマージ)
      mergeFeedFields(feed.id, pick(optimisticFeed));
      try {
        const updated = await patchFeed(feed.id, patch);
        if (updated) {
          // サーバー応答の同フィールドで確定 (他フィールドの並行変更は保持)
          mergeFeedFields(feed.id, pick(updated));
          return updated;
        }
        // res.ok=false: 変更フィールドのみ元値に rollback + ユーザー通知
        mergeFeedFields(feed.id, pick(feed));
        onError?.("変更の保存に失敗しました");
        return null;
      } catch (err) {
        devError("[useFeedPatch] patch failed:", err);
        // エラーは変更フィールドのみ元値に rollback + ユーザー通知
        mergeFeedFields(feed.id, pick(feed));
        onError?.("変更の保存に失敗しました");
        return null;
      }
    },
    [patchFeed, mergeFeedFields, onError],
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
      // saveFilter はフィードオブジェクトなしで呼ばれるため楽観的更新なし（サーバー応答後に確定）。
      // filter フィールドのみマージして他フィールドの並行変更を保持する。
      const updated = await patchFeed(feedId, { filter });
      if (updated) {
        mergeFeedFields(feedId, { filter: updated.filter });
      } else {
        throw new Error("フィルターの保存に失敗しました");
      }
    },
    [patchFeed, mergeFeedFields],
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
