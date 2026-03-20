import { useState } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article } from './types';

export default function App() {
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
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
