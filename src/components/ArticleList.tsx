import { useState, useEffect, useCallback } from 'react';
import type { Article } from '../types';

interface Props {
  feedId: string | null;
  selectedArticleId: string | null;
  onSelectArticle: (article: Article) => void;
}

export default function ArticleList({ feedId, selectedArticleId, onSelectArticle }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadArticles = useCallback(
    async (p: number, replace: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: '30',
          ...(feedId && { feedId }),
          ...(unreadOnly && { unreadOnly: 'true' }),
        });
        const res = await fetch(`/api/articles?${params}`);
        const data: Article[] = await res.json();
        setArticles((prev) => (replace ? data : [...prev, ...data]));
        setHasMore(data.length === 30);
      } finally {
        setLoading(false);
      }
    },
    [feedId, unreadOnly]
  );

  useEffect(() => {
    setPage(1);
    loadArticles(1, true);
  }, [feedId, unreadOnly, loadArticles]);

  function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }

  async function selectArticle(article: Article) {
    onSelectArticle(article);
    if (!article.is_read) {
      await fetch(`/api/articles/${article.id}/read`, { method: 'PATCH' });
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, is_read: true } : a))
      );
    }
  }

  return (
    <div className="w-80 flex-shrink-0 border-r border-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-sm font-medium">記事一覧</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded"
          />
          未読のみ
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {articles.map((article) => (
          <div
            key={article.id}
            onClick={() => selectArticle(article)}
            className={`px-4 py-3 border-b border-gray-800/60 cursor-pointer transition-colors ${
              selectedArticleId === article.id
                ? 'bg-gray-800'
                : 'hover:bg-gray-900/80'
            }`}
          >
            <p
              className={`text-sm leading-snug mb-1 ${
                article.is_read ? 'text-gray-400' : 'text-white font-medium'
              }`}
            >
              {article.title || '(タイトルなし)'}
            </p>
            <p className="text-xs text-gray-500">{formatDate(article.published_at)}</p>
          </div>
        ))}

        {!loading && articles.length === 0 && (
          <p className="text-center text-gray-500 text-sm mt-10">記事がありません</p>
        )}

        {loading && (
          <p className="text-center text-gray-500 text-sm mt-6 animate-pulse">読み込み中...</p>
        )}

        {!loading && hasMore && (
          <button
            onClick={() => {
              const next = page + 1;
              setPage(next);
              loadArticles(next, false);
            }}
            className="w-full py-3 text-sm text-gray-400 hover:text-white transition-colors"
          >
            もっと読む
          </button>
        )}
      </div>
    </div>
  );
}
