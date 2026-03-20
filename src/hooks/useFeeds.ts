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
  replaceFeeds: (feeds: Feed[]) => void;
  refreshFeeds: () => Promise<void>;
  dismissNewArticles: () => void;
}

export function useFeeds(user: UserProfile | null | undefined): FeedsState {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const latestArticleIdRef = useRef<string | null>(null);

  async function fetchAndSetArticles() {
    const data = await fetch('/api/articles').then((r) => r.json() as Promise<Article[]>);
    setArticles(data);
    latestArticleIdRef.current = data[0]?.id ?? null;
    return data;
  }

  useEffect(() => {
    if (!user) return;
    setLoadingArticles(true);
    fetch('/api/feeds')
      .then((r) => r.json() as Promise<Feed[]>)
      .then(setFeeds)
      .catch(console.error);
    fetchAndSetArticles()
      .catch(console.error)
      .finally(() => setLoadingArticles(false));
  }, [user]);

  // 5分ごとに記事を再取得して新着件数を通知する
  useEffect(() => {
    if (!user) return;

    const timer = setInterval(() => {
      fetch('/api/articles')
        .then((r) => r.json() as Promise<Article[]>)
        .then((data) => {
          const prevTopId = latestArticleIdRef.current;
          if (prevTopId === null) return;
          const newIdx = data.findIndex((a) => a.id === prevTopId);
          const count = newIdx > 0 ? newIdx : 0;
          setArticles(data);
          latestArticleIdRef.current = data[0]?.id ?? prevTopId;
          if (count > 0) setNewArticleCount((prev) => prev + count);
        })
        .catch(console.error);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user]);

  const onFeedAdded = useCallback((feed: Feed) => {
    setFeeds((prev) => [...prev, feed]);
  }, []);

  // フィード削除: feeds と articles からエントリを除去する。
  // 選択状態のクリアは呼び出し元 (App) が担当する。
  const removeFeed = useCallback((id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedId !== id));
  }, []);

  const replaceFeeds = useCallback((newFeeds: Feed[]) => {
    setFeeds(newFeeds);
    // インポート後に記事を再取得する
    setLoadingArticles(true);
    fetchAndSetArticles()
      .catch(console.error)
      .finally(() => setLoadingArticles(false));
  }, []);

  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/feeds/refresh', { method: 'POST' });
      const [feedsData, articlesData] = await Promise.all([
        fetch('/api/feeds').then((r) => r.json() as Promise<Feed[]>),
        fetch('/api/articles').then((r) => r.json() as Promise<Article[]>),
      ]);
      setFeeds(feedsData);
      setArticles(articlesData);
      latestArticleIdRef.current = articlesData[0]?.id ?? null;
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const dismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
  }, []);

  return { feeds, articles, loadingArticles, refreshing, newArticleCount, onFeedAdded, removeFeed, replaceFeeds, refreshFeeds, dismissNewArticles };
}
