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
    <section className="flex flex-col h-full border-r border-white/[0.06] bg-[#161b22]/60 backdrop-blur-sm">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
          記事
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none group">
          <div
            onClick={() => setUnreadOnly((v) => !v)}
            className={`relative w-7 h-4 rounded-full transition-colors duration-200 ${
              unreadOnly ? 'bg-indigo-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${
                unreadOnly ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </div>
          <span className="text-[11px] text-zinc-500 group-hover:text-zinc-400 transition-colors">未読</span>
        </label>
      </div>

      {/* 記事リスト */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {/* スケルトンローダー */}
        {loading && articles.length === 0 &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl animate-pulse">
              <div className="h-3 bg-white/[0.06] rounded w-3/4 mb-2" />
              <div className="h-3 bg-white/[0.04] rounded w-1/2 mb-3" />
              <div className="h-2.5 bg-white/[0.03] rounded w-1/4" />
            </div>
          ))
        }

        {!loading && articles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-xs">記事がありません</p>
          </div>
        )}

        {articles.map((article) => {
          const isRead = Boolean(article.is_read);
          const isSelected = selectedArticleId === article.id;
          return (
            <article
              key={article.id}
              onClick={() => selectArticle(article)}
              className={`relative group p-4 rounded-xl cursor-pointer transition-all duration-150 ${
                isSelected
                  ? 'bg-white/[0.07] border border-white/[0.12] shadow-lg'
                  : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.09] hover:-translate-y-0.5'
              }`}
            >
              {/* 未読インジケーター */}
              {!isRead && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
              <div className={!isRead ? 'pl-2' : ''}>
                <h3
                  className={`text-[13px] leading-snug line-clamp-2 mb-1.5 transition-colors ${
                    isRead ? 'text-zinc-500 font-normal' : 'text-zinc-100 font-medium'
                  }`}
                >
                  {article.title || '(タイトルなし)'}
                </h3>
                {article.summary && (
                  <p className="text-[11px] text-zinc-600 line-clamp-2 leading-relaxed mb-2">
                    {article.summary}
                  </p>
                )}
                <span className="text-[10px] text-zinc-600">{timeAgo(article.published_at)}</span>
              </div>
            </article>
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
