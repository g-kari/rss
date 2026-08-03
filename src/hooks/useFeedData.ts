"use client";

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import type { Feed, UserProfile } from "../types";
import { apiFetchJson } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { isAbortError } from "../lib/fetch";
import { STORAGE_KEYS, storageSet, loadJsonObject } from "../lib/storage";
import { useSyncedRef } from "./useSyncedRef";

// localStorage cache 復元用の minimal type guard。canonical parallels: useAuth の
// `isUserProfileOrNull` (必須 field のみ検証、optional field は許容)。
// stale cache の場合でも id / url / title / siteUrl があれば sidebar 表示は成立し、
// fetch 完了で最新に上書きされる。全 field 検証は overkill (Feed は 12+ field で maintenance 負荷大)。
const isFeedArray = (v: unknown): v is Feed[] => {
  if (!Array.isArray(v)) return false;
  return v.every((f) => {
    if (typeof f !== "object" || f === null) return false;
    const p = f as Record<string, unknown>;
    return (
      typeof p.id === "string" &&
      typeof p.url === "string" &&
      typeof p.title === "string" &&
      typeof p.siteUrl === "string"
    );
  });
};

interface FeedDataState {
  feeds: Feed[];
  loadingFeeds: boolean;
  feedLoadError: boolean;
  retryFeedList: () => void;
  setFeeds: Dispatch<SetStateAction<Feed[]>>;
  onFeedAdded: (feed: Feed) => void;
  removeFeedFromList: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  mergeFeedFields: (id: string, fields: Partial<Feed>) => void;
  appendFeeds: (feeds: Feed[]) => void;
  refreshFeedsList: () => Promise<Feed[]>;
}

/**
 * フィード本体配列を `/api/feeds` から取得して state 管理する hook (`useFeeds` のサブフック)。
 * @param user - ログイン中ユーザー (null / undefined のときは fetch を skip)
 * @param onError - エラー時の通知 callback
 * @returns `FeedDataState` (`{ feeds, setFeeds, loadingFeeds, fetchFeeds, ... }`)
 */
export function useFeedData(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): FeedDataState {
  // 初期表示 optimistic 復元: 前回セッションの feeds を localStorage cache から復元して
  // auth 完了 → /api/feeds fetch 待ちの sidebar empty state (数百 ms - 数秒) を回避。
  // useAuth の CACHED_USER と同 pattern (useState initializer で復元、fetch 完了で上書き)。
  const [feeds, setFeeds] = useState<Feed[]>(() =>
    loadJsonObject<Feed[]>(STORAGE_KEYS.CACHED_FEEDS, [], isFeedArray),
  );
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState(false);
  const onErrorRef = useSyncedRef(onError);

  const userId = user?.id ?? null;

  const fetchFeeds = useCallback(async (signal?: AbortSignal): Promise<Feed[]> => {
    const data = await apiFetchJson<Feed[]>("/api/feeds", { signal });
    setFeeds(data);
    // fetch 成功時に cache 更新 (次回 initial 表示で使用)。エラー時 (catch) は cache 維持
    // で offline / 一時的 network 障害でも前回 feeds 表示継続 (useAuth CACHED_USER と同挙動)。
    storageSet(STORAGE_KEYS.CACHED_FEEDS, JSON.stringify(data));
    return data;
  }, []);

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setLoadingFeeds(true);
    setFeedLoadError(false);
    fetchFeeds(controller.signal)
      .catch((err) => {
        if (isAbortError(err)) return;
        devError(err);
        onErrorRef.current?.("フィードの読み込みに失敗しました");
        setFeedLoadError(true);
      })
      .finally(() => {
        setLoadingFeeds(false);
      });
    return () => controller.abort();
  }, [userId, fetchFeeds]);

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const retryFeedList = useCallback(() => {
    setFeedLoadError(false);
    setLoadingFeeds(true);
    fetchFeeds()
      .catch((err) => {
        devError(err);
        onErrorRef.current?.("フィードの読み込みに失敗しました");
        setFeedLoadError(true);
      })
      .finally(() => {
        setLoadingFeeds(false);
      });
  }, [fetchFeeds]);

  const refreshFeedsList = useCallback(async (): Promise<Feed[]> => {
    return fetchFeeds();
  }, [fetchFeeds]);

  const onFeedAdded = useCallback((feed: Feed) => {
    setFeeds((prev) => [...prev, feed]);
  }, []);

  const removeFeedFromList = useCallback((id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFeed = useCallback((feed: Feed) => {
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
  }, []);

  // #1087: 指定 feed の一部フィールドのみを最新 state にマージする (full 置換しない)。
  // 楽観的更新の rollback で feed 全体を stale snapshot で置換すると、同一 feed の別フィールドの
  // 並行更新を巻き戻すバグがあった。field 単位マージなら他フィールドの並行変更を保持できる。
  const mergeFeedFields = useCallback((id: string, fields: Partial<Feed>) => {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, ...fields } : f)));
  }, []);

  const appendFeeds = useCallback((newFeeds: Feed[]) => {
    setFeeds((prev) => [...prev, ...newFeeds]);
  }, []);

  return {
    feeds,
    loadingFeeds,
    feedLoadError,
    retryFeedList,
    setFeeds,
    onFeedAdded,
    removeFeedFromList,
    updateFeed,
    mergeFeedFields,
    appendFeeds,
    refreshFeedsList,
  };
}
