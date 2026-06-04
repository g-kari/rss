"use client";

import { useState, useCallback } from "react";
import type { Feed, Article, UserProfile } from "../types";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";
import { useFeedData } from "./useFeedData";
import { useArticleData } from "./useArticleData";

interface FeedsState {
  feeds: Feed[];
  articles: Article[];
  loadingFeeds: boolean;
  loadingArticles: boolean;
  refreshing: boolean;
  newArticleCount: number;
  loadedFeedPages: Map<string, number>;
  fetchError: boolean;
  feedLoadError: boolean;
  retryInitialLoad: () => void;
  retryFeedList: () => void;
  onFeedAdded: (feed: Feed) => void;
  prependArticle: (article: Article) => void;
  removeFeed: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  mergeFeedFields: (id: string, fields: Partial<Feed>) => void;
  appendFeeds: (feeds: Feed[]) => Promise<void>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  reinferFeed: (feedId: string) => Promise<void>;
  dismissNewArticles: () => void;
  loadMoreFeedArticles: (feedId: string) => Promise<void>;
  loadMoreAllFeedsArticles: (feeds: Feed[]) => Promise<void>;
  skipRemainingPages: (feedId: string | null) => void;
}

/**
 * フィード一覧 + 関連 state (feed data / feedGroups / categories / sidebarFeeds 等) を集約取得する hook。
 * @param user - ログイン中ユーザー (null / undefined のときは fetch を skip)
 * @param onError - エラー時の通知 callback
 * @returns `FeedsState` (フィード配列 + groups + categories + 操作 callback 群)
 */
export function useFeeds(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): FeedsState {
  const [refreshing, setRefreshing] = useState(false);
  const onErrorRef = useSyncedRef(onError);

  const {
    feeds,
    loadingFeeds,
    feedLoadError,
    retryFeedList,
    onFeedAdded,
    removeFeedFromList,
    updateFeed,
    mergeFeedFields,
    appendFeeds: appendFeedsToList,
    refreshFeedsList,
  } = useFeedData(user, onError);

  const {
    articles,
    loadingArticles,
    newArticleCount,
    loadedFeedPages,
    fetchError,
    fetchAndSetArticles,
    mergeArticles,
    removeArticlesByFeed,
    prependArticle,
    dismissNewArticles,
    loadMoreFeedArticles,
    loadMoreAllFeedsArticles,
    skipRemainingPages: skipRemainingPagesBase,
    setFetchError,
    setLoadingArticles,
  } = useArticleData(user, onError);

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  const retryInitialLoad = useCallback(() => {
    setFetchError(false);
    setLoadingArticles(true);
    fetchAndSetArticles()
      .catch((err) => {
        devError(err);
        onErrorRef.current?.("記事の読み込みに失敗しました");
        setFetchError(true);
      })
      .finally(() => {
        setLoadingArticles(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAndSetArticles, setFetchError, setLoadingArticles]);

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  const appendFeeds = useCallback(
    async (newFeeds: Feed[]) => {
      appendFeedsToList(newFeeds);
      setLoadingArticles(true);
      try {
        await fetchAndSetArticles();
      } catch (err) {
        devError(err);
        onErrorRef.current?.("記事の読み込みに失敗しました");
      } finally {
        setLoadingArticles(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appendFeedsToList, fetchAndSetArticles, setLoadingArticles],
  );

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      await apiFetch("/api/feeds/refresh", { method: "POST" });
      const [fresh] = await Promise.all([
        apiFetchJson<Article[]>("/api/articles"),
        refreshFeedsList(),
      ]);
      mergeArticles(fresh);
    } catch (err) {
      devError(err);
      onErrorRef.current?.("更新に失敗しました");
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergeArticles, refreshFeedsList]);

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  const feedActionWithRefresh = useCallback(
    async (feedId: string, endpoint: string, errorMessage: string): Promise<void> => {
      try {
        const feed = await apiFetchJson<Feed>(`/api/feeds/${feedId}/${endpoint}`, {
          method: "POST",
        });
        updateFeed(feed);
        mergeArticles(await apiFetchJson<Article[]>("/api/articles"));
      } catch (err) {
        devError(`[${endpoint}] feed action failed:`, err);
        onErrorRef.current?.(errorMessage);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mergeArticles, updateFeed],
  );

  const retryFeed = useCallback(
    (feedId: string) => feedActionWithRefresh(feedId, "refresh", "フィードの再取得に失敗しました"),
    [feedActionWithRefresh],
  );

  const reinferFeed = useCallback(
    (feedId: string) => feedActionWithRefresh(feedId, "reinfer", "セレクタの再推論に失敗しました"),
    [feedActionWithRefresh],
  );

  const removeFeed = useCallback(
    (id: string) => {
      removeFeedFromList(id);
      removeArticlesByFeed(id);
    },
    [removeFeedFromList, removeArticlesByFeed],
  );

  const skipRemainingPages = useCallback(
    (feedId: string | null) => {
      skipRemainingPagesBase(feedId, feeds);
    },
    [skipRemainingPagesBase, feeds],
  );

  return {
    feeds,
    articles,
    loadingFeeds,
    loadingArticles,
    refreshing,
    newArticleCount,
    loadedFeedPages,
    fetchError,
    feedLoadError,
    retryInitialLoad,
    retryFeedList,
    onFeedAdded,
    prependArticle,
    removeFeed,
    updateFeed,
    mergeFeedFields,
    appendFeeds,
    refreshFeeds,
    retryFeed,
    reinferFeed,
    dismissNewArticles,
    loadMoreFeedArticles,
    loadMoreAllFeedsArticles,
    skipRemainingPages,
  };
}
