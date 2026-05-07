"use client";

import { useState, useEffect, useCallback } from "react";
import type { Feed, UserProfile } from "../types";
import { apiFetchJson } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";

interface FeedDataState {
  feeds: Feed[];
  loadingFeeds: boolean;
  feedLoadError: boolean;
  retryFeedList: () => void;
  setFeeds: React.Dispatch<React.SetStateAction<Feed[]>>;
  onFeedAdded: (feed: Feed) => void;
  removeFeedFromList: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  appendFeeds: (feeds: Feed[]) => void;
  refreshFeedsList: () => Promise<Feed[]>;
}

export function useFeedData(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): FeedDataState {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [feedLoadError, setFeedLoadError] = useState(false);
  const onErrorRef = useSyncedRef(onError);

  const userId = user?.id ?? null;

  const fetchFeeds = useCallback(async (): Promise<Feed[]> => {
    const data = await apiFetchJson<Feed[]>("/api/feeds");
    setFeeds(data);
    return data;
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoadingFeeds(true);
    setFeedLoadError(false);
    fetchFeeds()
      .catch((err) => {
        devError(err);
        onErrorRef.current?.("フィードの読み込みに失敗しました");
        setFeedLoadError(true);
      })
      .finally(() => {
        setLoadingFeeds(false);
      });
  }, [userId, fetchFeeds, onErrorRef]);

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
  }, [fetchFeeds, onErrorRef]);

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
