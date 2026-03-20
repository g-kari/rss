import { useState, useEffect } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article, Feed } from './types';

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
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  useEffect(() => {
    fetch('/data/feeds.json')
      .then((r) => r.json<Feed[]>())
      .then(setFeeds)
      .catch(console.error);

    fetch('/data/articles.json')
      .then((r) => r.json<Article[]>())
      .then(setArticles)
      .catch(console.error);
  }, []);

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
