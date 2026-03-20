import { useState, useEffect, useCallback } from 'react';
import type { Article } from '../types';

interface Props {
  feedId: string | null;
  selectedArticleId: string | null;
  onSelectArticle: (article: Article) => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
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
    <section className="flex flex-col min-h-0 overflow-hidden border-r border-zinc-800 bg-zinc-950">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
        <span className="text-xs font-medium text-zinc-500">記事</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="w-3 h-3 accent-indigo-500"
          />
          <span className="text-xs text-zinc-600">未読のみ</span>
        </label>
      </div>

      {/* リスト */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-900">
        {/* スケルトン */}
        {loading && articles.length === 0 &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 animate-pulse space-y-2">
              <div className="h-3 bg-zinc-800 rounded w-4/5" />
              <div className="h-2.5 bg-zinc-800/60 rounded w-3/5" />
              <div className="h-2 bg-zinc-800/40 rounded w-1/4" />
            </div>
          ))
        }

        {!loading && articles.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-600">
            <p className="text-xs">記事がありません</p>
          </div>
        )}

        {articles.map((article) => {
          const isRead = Boolean(article.is_read);
          const isSelected = selectedArticleId === article.id;
          return (
            <div
              key={article.id}
              onClick={() => selectArticle(article)}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}
            >
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-[13px] leading-snug line-clamp-2 mb-1 ${
                    isRead ? 'text-zinc-600 font-normal' : 'text-zinc-200 font-medium'
                  }`}
                >
                  {article.title || '(タイトルなし)'}
                </h3>
                {article.summary && (
                  <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed mb-1.5">
                    {article.summary}
                  </p>
                )}
                <span className="text-xs text-zinc-700">{timeAgo(article.published_at)}</span>
              </div>
              {!isRead && (
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
              )}
            </div>
          );
        })}

        {!loading && hasMore && (
          <button
            onClick={() => {
              const next = page + 1;
              setPage(next);
              loadArticles(next, false);
            }}
            className="w-full py-3 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            さらに読み込む
          </button>
        )}
      </div>
    </section>
  );
}
