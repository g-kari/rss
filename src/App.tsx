import { useState } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article } from './types';

export default function App() {
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  return (
    <div
      className="grid h-screen font-sans antialiased bg-zinc-950 text-zinc-200"
      style={{ gridTemplateColumns: '200px 380px 1fr', gridTemplateRows: '100%' }}
    >
      <FeedSidebar
        selectedFeedId={selectedFeedId}
        onSelectFeed={(id) => {
          setSelectedFeedId(id);
          setSelectedArticle(null);
        }}
      />
      <ArticleList
        feedId={selectedFeedId}
        selectedArticleId={selectedArticle?.id ?? null}
        onSelectArticle={setSelectedArticle}
      />
      <ArticleView article={selectedArticle} />
    </div>
  );
}
