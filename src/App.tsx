import { useState } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article } from './types';

export default function App() {
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  return (
    <div className="relative h-screen overflow-hidden font-sans antialiased">
      {/* アンビエントグラデーション背景 */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-indigo-900/25 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-violet-900/20 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-indigo-800/10 rounded-full blur-[80px]" />
      </div>

      {/* 3ペインレイアウト */}
      <div
        className="grid h-full overflow-hidden"
        style={{ gridTemplateColumns: '220px 360px 1fr' }}
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
    </div>
  );
}
