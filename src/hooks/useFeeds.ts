'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Feed, Article, UserProfile } from '../types';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5分

interface FeedsState {
  feeds: Feed[];
  articles: Article[];
  loadingArticles: boolean;
  refreshing: boolean;
  newArticleCount: number;
  onFeedAdded: (feed: Feed) => void;
  removeFeed: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  replaceFeeds: (feeds: Feed[]) => void;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  dismissNewArticles: () => void;
}

export function useFeeds(user: UserProfile | null | undefined, onError?: (msg: string) => void): FeedsState {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const latestArticleIdRef = useRef<string | null>(null);

  const fetchAndSetArticles = useCallback(async () => {
    const res = await fetch('/api/articles');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Article[];
    setArticles(data);
    latestArticleIdRef.current = data[0]?.id ?? null;
    return data;
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingArticles(true);
    fetch('/api/feeds')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Feed[]>; })
      .then(setFeeds)
      .catch((err) => { console.error(err); onError?.('フィードの読み込みに失敗しました'); });
    fetchAndSetArticles()
      .catch((err) => { console.error(err); onError?.('記事の読み込みに失敗しました'); })
      .finally(() => setLoadingArticles(false));
  }, [user, onError, fetchAndSetArticles]);

  // 5分ごとに記事を再取得して新着件数を通知する
  useEffect(() => {
    if (!user) return;

    const timer = setInterval(async () => {
      const prevTopId = latestArticleIdRef.current;
      if (prevTopId === null) return;
      try {
        const data = await fetchAndSetArticles();
        const newIdx = data.findIndex((a) => a.id === prevTopId);
        if (newIdx > 0) setNewArticleCount((prev) => prev + newIdx);
      } catch {
        // ポーリングエラーはサイレント失敗
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user, fetchAndSetArticles]);

  const onFeedAdded = useCallback((feed: Feed) => {
    setFeeds((prev) => [...prev, feed]);
  }, []);

  // フィード削除: feeds と articles からエントリを除去する。
  // 選択状態のクリアは呼び出し元 (App) が担当する。
  const removeFeed = useCallback((id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedId !== id));
  }, []);

  const updateFeed = useCallback((feed: Feed) => {
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
  }, []);

  const replaceFeeds = useCallback((newFeeds: Feed[]) => {
    setFeeds(newFeeds);
    // インポート後に記事を再取得する
    setLoadingArticles(true);
    fetchAndSetArticles()
      .catch((err) => { console.error(err); onError?.('記事の読み込みに失敗しました'); })
      .finally(() => setLoadingArticles(false));
  }, [fetchAndSetArticles, onError]);

  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/feeds/refresh', { method: 'POST' });
      const [feedsData] = await Promise.all([
        fetch('/api/feeds').then((r) => r.json() as Promise<Feed[]>),
        fetchAndSetArticles(),
      ]);
      setFeeds(feedsData);
    } catch (err) {
      console.error('Refresh failed:', err);
      onError?.('更新に失敗しました');
    } finally {
      setRefreshing(false);
    }
  }, [fetchAndSetArticles, onError]);

  const retryFeed = useCallback(async (feedId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/feeds/${feedId}/refresh`, { method: 'POST' });
      if (!res.ok) return;
      const feed = await res.json() as Feed;
      setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
      await fetchAndSetArticles();
    } catch (err) {
      console.error('retryFeed failed:', err);
      onError?.('フィードの再取得に失敗しました');
    }
  }, [fetchAndSetArticles, onError]);

  const dismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
  }, []);

  return { feeds, articles, loadingArticles, refreshing, newArticleCount, onFeedAdded, removeFeed, updateFeed, replaceFeeds, refreshFeeds, retryFeed, dismissNewArticles };
}
