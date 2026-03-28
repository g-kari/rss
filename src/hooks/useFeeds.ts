"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Feed, Article, UserProfile } from "../types";
import { useOnlineStatus } from "./useOnlineStatus";
import { apiFetch } from "../lib/api-fetch";
import { compareByDateDesc } from "../lib/article-utils";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5分

/** incoming のうち existing に存在しない記事だけを返す */
function filterNewArticles(existing: Article[], incoming: Article[]): Article[] {
  if (existing.length === 0) return incoming;
  const existingIds = new Set(existing.map((a) => a.id));
  return incoming.filter((a) => !existingIds.has(a.id));
}

interface FeedsState {
  feeds: Feed[];
  articles: Article[];
  loadingArticles: boolean;
  refreshing: boolean;
  newArticleCount: number;
  loadedFeedPages: Map<string, number>;
  onFeedAdded: (feed: Feed) => void;
  prependArticle: (article: Article) => void;
  removeFeed: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  replaceFeeds: (feeds: Feed[]) => void;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  reinferFeed: (feedId: string) => Promise<void>;
  dismissNewArticles: () => void;
  loadMoreFeedArticles: (feedId: string) => Promise<void>;
}

export function useFeeds(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): FeedsState {
  const isOnline = useOnlineStatus();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [loadedFeedPages, setLoadedFeedPages] = useState<Map<string, number>>(() => new Map());
  const loadedFeedPagesRef = useRef(loadedFeedPages);
  loadedFeedPagesRef.current = loadedFeedPages;
  const latestArticleIdRef = useRef<string | null>(null);
  const isPollingRef = useRef(false);
  const prevIsOnlineRef = useRef(isOnline);

  const fetchFeedsData = useCallback(async () => {
    const r = await apiFetch("/api/feeds");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<Feed[]>;
  }, []);

  const fetchAndSetArticles = useCallback(async () => {
    const res = await apiFetch("/api/articles");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Article[];
    setArticles(data);
    latestArticleIdRef.current = data[0]?.id ?? null;
    return data;
  }, []);

  const mergeArticles = useCallback((fresh: Article[]) => {
    if (fresh.length > 0) latestArticleIdRef.current = fresh[0].id;
    setArticles((prev) => {
      const brandNew = filterNewArticles(prev, fresh);
      if (brandNew.length === 0) return prev;
      return [...brandNew, ...prev].sort(compareByDateDesc);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingArticles(true);
    fetchFeedsData()
      .then(setFeeds)
      .catch((err) => {
        console.error(err);
        onError?.("フィードの読み込みに失敗しました");
      });
    fetchAndSetArticles()
      .catch((err) => {
        console.error(err);
        onError?.("記事の読み込みに失敗しました");
      })
      .finally(() => setLoadingArticles(false));
  }, [user, onError, fetchFeedsData, fetchAndSetArticles]);

  // 新着確認フェッチ: 既存記事は消さずに新着のみ追加する（閲覧中の記事を守る）
  const pollNow = useCallback(async () => {
    const prevTopId = latestArticleIdRef.current;
    if (prevTopId === null) return; // 初回ロード前はスキップ
    if (isPollingRef.current) return; // 前回のフェッチが完了していない場合はスキップ
    isPollingRef.current = true;
    try {
      const res = await apiFetch("/api/articles");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh = (await res.json()) as Article[];
      mergeArticles(fresh);
      const newIdx = fresh.findIndex((a) => a.id === prevTopId);
      if (newIdx > 0) setNewArticleCount((prev) => prev + newIdx);
    } catch {
      // ポーリングエラーはサイレント失敗
    } finally {
      isPollingRef.current = false;
    }
  }, [mergeArticles]);

  // 5分ごとに記事を再取得して新着件数を通知する（オフライン時はスキップ）
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (!isOnline) return; // オフライン時はスキップ
      void pollNow();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user, isOnline, pollNow]);

  // オンライン復帰時に即座にポーリングを実行する
  useEffect(() => {
    if (!user) return;
    if (!isOnline) {
      prevIsOnlineRef.current = false;
      return;
    }
    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = true;
    if (!wasOffline) return;
    void pollNow();
  }, [user, isOnline, pollNow]);

  const onFeedAdded = useCallback((feed: Feed) => {
    setFeeds((prev) => [...prev, feed]);
  }, []);

  /** 単一記事をリスト先頭に追加する（URL 保存機能で使用） */
  const prependArticle = useCallback((article: Article) => {
    setArticles((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      return [article, ...prev];
    });
  }, []);

  // フィード削除: feeds と articles からエントリを除去する。
  // 選択状態のクリアは呼び出し元 (App) が担当する。
  const removeFeed = useCallback((id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedHash !== id));
  }, []);

  const updateFeed = useCallback((feed: Feed) => {
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
  }, []);

  const replaceFeeds = useCallback(
    async (newFeeds: Feed[]) => {
      setFeeds(newFeeds);
      // インポート後に記事を再取得する
      setLoadingArticles(true);
      try {
        await fetchAndSetArticles();
      } catch (err) {
        console.error(err);
        onError?.("記事の読み込みに失敗しました");
      } finally {
        setLoadingArticles(false);
      }
    },
    [fetchAndSetArticles, onError],
  );

  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      await apiFetch("/api/feeds/refresh", { method: "POST" });
      const [articlesRes, feedsData] = await Promise.all([
        apiFetch("/api/articles"),
        fetchFeedsData(),
      ]);
      if (!articlesRes.ok) throw new Error(`HTTP ${articlesRes.status}`);
      const fresh = (await articlesRes.json()) as Article[];
      setFeeds(feedsData);
      mergeArticles(fresh);
    } catch (err) {
      console.error("Refresh failed:", err);
      onError?.("更新に失敗しました");
    } finally {
      setRefreshing(false);
    }
  }, [fetchFeedsData, mergeArticles, onError]);

  /** フィードエンドポイントに POST し、フィードと記事を更新する共通実装 */
  const feedActionWithRefresh = useCallback(
    async (feedId: string, endpoint: string, errorMessage: string): Promise<void> => {
      try {
        const res = await apiFetch(`/api/feeds/${feedId}/${endpoint}`, { method: "POST" });
        if (!res.ok) return;
        const feed = (await res.json()) as Feed;
        setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
        const articlesRes = await apiFetch("/api/articles");
        if (articlesRes.ok) {
          mergeArticles((await articlesRes.json()) as Article[]);
        }
      } catch (err) {
        console.error(`[${endpoint}] feed action failed:`, err);
        onError?.(errorMessage);
      }
    },
    [mergeArticles, onError],
  );

  const retryFeed = useCallback(
    (feedId: string) => feedActionWithRefresh(feedId, "refresh", "フィードの再取得に失敗しました"),
    [feedActionWithRefresh],
  );

  const reinferFeed = useCallback(
    (feedId: string) => feedActionWithRefresh(feedId, "reinfer", "セレクタの再推論に失敗しました"),
    [feedActionWithRefresh],
  );

  const dismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
  }, []);

  // フィードの過去ページを追加読み込みする
  const loadMoreFeedArticles = useCallback(
    async (feedId: string): Promise<void> => {
      const nextPage = (loadedFeedPagesRef.current.get(feedId) ?? 1) + 1;
      try {
        const res = await apiFetch(`/api/articles?feed=${feedId}&page=${nextPage}`);
        if (!res.ok) return;
        const data = (await res.json()) as Article[];
        if (data.length === 0) return;
        setArticles((prev) => {
          const newOnes = filterNewArticles(prev, data);
          if (newOnes.length === 0) return prev;
          return [...prev, ...newOnes];
        });
        setLoadedFeedPages((prev) => new Map(prev).set(feedId, nextPage));
      } catch (err) {
        console.error("loadMoreFeedArticles failed:", err);
        onError?.("過去の記事の読み込みに失敗しました");
      }
    },
    [onError],
  );

  return {
    feeds,
    articles,
    loadingArticles,
    refreshing,
    newArticleCount,
    loadedFeedPages,
    onFeedAdded,
    prependArticle,
    removeFeed,
    updateFeed,
    replaceFeeds,
    refreshFeeds,
    retryFeed,
    reinferFeed,
    dismissNewArticles,
    loadMoreFeedArticles,
  };
}
