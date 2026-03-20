import { useState, useEffect } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article, Feed, UserProfile } from './types';

function loadReadIds(): Set<string> {
  try {
    const stored = localStorage.getItem('rss-read');
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem('rss-read', JSON.stringify([...ids]));
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined); // undefined = loading
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json<{ user: UserProfile | null }>())
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null));
  }, []);

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

  function markRead(articleId: string) {
    setReadIds((prev) => {
      const next = new Set(prev).add(articleId);
      saveReadIds(next);
      return next;
    });
  }

  function onFeedAdded(feed: Feed) {
    setFeeds((prev) => [...prev, feed]);
  }

  function onFeedDeleted(id: string) {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    if (selectedFeedId === id) {
      setSelectedFeedId(null);
      setSelectedArticle(null);
    }
  }

  // ローディング
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="w-2 h-2 rounded-full bg-zinc-700 animate-pulse" />
      </div>
    );
  }

  // 未ログイン
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-6">
            RSS Reader
          </p>
          <a
            href="/api/auth/login"
            className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
          >
            0g0 ID でログイン
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid h-screen font-sans antialiased bg-zinc-950 text-zinc-200"
      style={{ gridTemplateColumns: '200px 380px 1fr', gridTemplateRows: '100%' }}
    >
      <FeedSidebar
        feeds={feeds}
        articles={articles}
        readIds={readIds}
        selectedFeedId={selectedFeedId}
        user={user}
        onSelectFeed={(id) => {
          setSelectedFeedId(id);
          setSelectedArticle(null);
        }}
        onFeedAdded={onFeedAdded}
        onFeedDeleted={onFeedDeleted}
      />
      <ArticleList
        articles={articles}
        feedId={selectedFeedId}
        readIds={readIds}
        selectedArticleId={selectedArticle?.id ?? null}
        onSelectArticle={(article) => {
          setSelectedArticle(article);
          markRead(article.id);
        }}
      />
      <ArticleView article={selectedArticle} />
    </div>
  );
}
