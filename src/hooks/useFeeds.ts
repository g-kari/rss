import { useState, useEffect, useCallback } from 'react';
import type { Feed, Article, UserProfile } from '../types';

interface FeedsState {
  feeds: Feed[];
  articles: Article[];
  onFeedAdded: (feed: Feed) => void;
  removeFeed: (id: string) => void;
}

export function useFeeds(user: UserProfile | null | undefined): FeedsState {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/feeds')
      .then((r) => r.json<Feed[]>())
      .then(setFeeds)
      .catch(console.error);
    fetch('/api/articles')
      .then((r) => r.json<Article[]>())
      .then(setArticles)
      .catch(console.error);
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

  return { feeds, articles, onFeedAdded, removeFeed };
}
