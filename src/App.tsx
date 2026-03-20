import { useState, useEffect, useCallback } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article, Feed, UserProfile } from './types';

function loadSet(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

const loadReadIds = () => loadSet('rss-read');
const loadBookmarkIds = () => loadSet('rss-bookmarks');

export default function App() {
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined); // undefined = loading
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(loadBookmarkIds);
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

  const markRead = useCallback((articleId: string) => {
    setReadIds((prev) => {
      const next = new Set(prev).add(articleId);
      saveSet('rss-read', next);
      return next;
    });
  }, []);

  const toggleBookmark = useCallback((articleId: string) => {
    setBookmarkIds((prev) => {
      const next = new Set(prev);
      next.has(articleId) ? next.delete(articleId) : next.add(articleId);
      saveSet('rss-bookmarks', next);
      return next;
    });
  }, []);

  // キーボードナビゲーション: j/↓ 次の記事、k/↑ 前の記事、o 元記事を開く、b ブックマーク切り替え
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const list =
        selectedFeedId === '__bookmarks__'
          ? articles.filter((a) => bookmarkIds.has(a.id))
          : selectedFeedId
            ? articles.filter((a) => a.feedId === selectedFeedId)
            : articles;
      const idx = selectedArticle ? list.findIndex((a) => a.id === selectedArticle.id) : -1;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = list[idx + 1];
        if (next) { setSelectedArticle(next); markRead(next.id); }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) { const prev = list[idx - 1]; setSelectedArticle(prev); markRead(prev.id); }
      } else if (e.key === 'o' && selectedArticle?.link) {
        window.open(selectedArticle.link, '_blank', 'noopener,noreferrer');
      } else if (e.key === 'b' && selectedArticle) {
        toggleBookmark(selectedArticle.id);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [articles, selectedFeedId, selectedArticle, markRead, bookmarkIds, toggleBookmark]);

  function onFeedAdded(feed: Feed) {
    setFeeds((prev) => [...prev, feed]);
  }

  function onFeedDeleted(id: string) {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedId !== id));
    if (selectedFeedId === id) {
      setSelectedFeedId(null);
      setSelectedArticle(null);
    }
  }

  const bookmarkCount = articles.filter((a) => bookmarkIds.has(a.id)).length;

  // ローディング
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-pulse" />
      </div>
    );
  }

  // 未ログイン
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-center animate-fade-up">
          <p className="text-[11px] tracking-[0.3em] uppercase text-stone-400 mb-10">
            RSS
          </p>
          <a
            href="/api/auth/login"
            className="inline-block px-7 py-2.5 bg-stone-800 hover:bg-stone-700 text-white text-[12px] tracking-[0.08em] rounded-full transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
          >
            0g0 ID でログイン
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid h-screen font-sans antialiased bg-stone-50 text-stone-800"
      style={{ gridTemplateColumns: '200px 360px 1fr', gridTemplateRows: '100%' }}
    >
      <FeedSidebar
        feeds={feeds}
        articles={articles}
        readIds={readIds}
        bookmarkCount={bookmarkCount}
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
        bookmarkIds={bookmarkIds}
        selectedArticleId={selectedArticle?.id ?? null}
        onSelectArticle={(article) => {
          setSelectedArticle(article);
          markRead(article.id);
        }}
      />
      <ArticleView
        article={selectedArticle}
        isBookmarked={selectedArticle ? bookmarkIds.has(selectedArticle.id) : false}
        onToggleBookmark={toggleBookmark}
      />
    </div>
  );
}
