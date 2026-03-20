import { useState, useMemo, useEffect } from 'react';
import type { Article } from '../types';

interface Props {
  articles: Article[];
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
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

const PAGE_SIZE = 30;

export default function ArticleList({
  articles,
  feedId,
  readIds,
  bookmarkIds,
  selectedArticleId,
  onSelectArticle,
}: Props) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // 選択記事が変わったらリスト内で自動スクロール
  useEffect(() => {
    if (selectedArticleId) {
      document
        .getElementById(`article-${selectedArticleId}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedArticleId]);

  const filtered = useMemo(() => {
    let list =
      feedId === '__bookmarks__'
        ? articles.filter((a) => bookmarkIds.has(a.id))
        : feedId
          ? articles.filter((a) => a.feedId === feedId)
          : articles;
    if (unreadOnly) list = list.filter((a) => !readIds.has(a.id));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q),
      );
    }
    return list;
  }, [articles, feedId, readIds, bookmarkIds, unreadOnly, query]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return (
    <section className="flex flex-col min-h-0 overflow-hidden border-r border-stone-200 bg-stone-50">
      {/* ヘッダー */}
      <div className="flex flex-col border-b border-stone-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] tracking-[0.12em] uppercase text-stone-400">
            記事{filtered.length > 0 && <span className="ml-1 text-stone-300">({filtered.length})</span>}
          </span>
          <button
            onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}
            className={`text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200 ${
              unreadOnly
                ? 'border-stone-800 bg-stone-800 text-white'
                : 'border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600'
            }`}
          >
            未読
          </button>
        </div>
        <div className="px-3 pb-2.5">
          <input
            type="search"
            placeholder="検索..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="w-full text-[12px] bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 placeholder-stone-300 outline-none focus:border-stone-400 transition-colors duration-200"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {articles.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[12px] text-stone-300">読み込み中...</p>
          </div>
        )}

        {articles.length > 0 && filtered.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[12px] text-stone-300">記事がありません</p>
          </div>
        )}

        {visible.map((article, i) => {
          const isRead = readIds.has(article.id);
          const isSelected = selectedArticleId === article.id;
          return (
            <div
              key={article.id}
              id={`article-${article.id}`}
              onClick={() => onSelectArticle(article)}
              className={`flex items-start gap-2.5 px-4 py-3 cursor-pointer border-b border-stone-100 transition-all duration-200 animate-fade-up ${
                isSelected
                  ? 'bg-white shadow-[inset_2px_0_0_0_#292524]'
                  : 'hover:bg-white/70'
              }`}
              style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
            >
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-[13px] leading-snug line-clamp-2 mb-1 transition-colors duration-200 ${
                    isRead ? 'text-stone-400 font-normal' : 'text-stone-700 font-medium'
                  }`}
                >
                  {article.title || '(タイトルなし)'}
                </h3>
                {article.summary && (
                  <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed mb-1">
                    {article.summary}
                  </p>
                )}
                <span className="text-[11px] text-stone-300">{timeAgo(article.publishedAt)}</span>
              </div>
              {!isRead && (
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
              )}
            </div>
          );
        })}

        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full py-4 text-[11px] tracking-[0.08em] text-stone-300 hover:text-stone-500 transition-colors duration-200"
          >
            さらに読み込む ({filtered.length - visible.length})
          </button>
        )}
      </div>
    </section>
  );
}

