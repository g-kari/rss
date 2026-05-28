"use client";

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import type { Feed, UserProfile } from "../types";
import { apiFetchJson } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { isAbortError } from "../lib/fetch";
import { useSyncedRef } from "./useSyncedRef";

interface FeedDataState {
  feeds: Feed[];
  loadingFeeds: boolean;
  feedLoadError: boolean;
  retryFeedList: () => void;
  setFeeds: Dispatch<SetStateAction<Feed[]>>;
  onFeedAdded: (feed: Feed) => void;
  removeFeedFromList: (id: string) => void;
  updateFeed: (feed: Feed) => void;
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
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState(false);
  const onErrorRef = useSyncedRef(onError);

  const userId = user?.id ?? null;

  const fetchFeeds = useCallback(async (signal?: AbortSignal): Promise<Feed[]> => {
    const data = await apiFetchJson<Feed[]>("/api/feeds", { signal });
    setFeeds(data);
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
    appendFeeds,
    refreshFeedsList,
  };
}
