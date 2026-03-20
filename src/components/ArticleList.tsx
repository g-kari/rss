import { useState, useMemo } from 'react';
import type { Article } from '../types';

interface Props {
  articles: Article[];
  feedId: string | null;
  readIds: Set<string>;
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
  selectedArticleId,
  onSelectArticle,
}: Props) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = feedId ? articles.filter((a) => a.feedId === feedId) : articles;
    if (unreadOnly) list = list.filter((a) => !readIds.has(a.id));
    return list;
  }, [articles, feedId, readIds, unreadOnly]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return (
    <section className="flex flex-col min-h-0 overflow-hidden border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
        <span className="text-xs font-medium text-zinc-500">
          記事 {filtered.length > 0 && <span className="text-zinc-600">({filtered.length})</span>}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }}
            className="w-3 h-3 accent-indigo-500"
          />
          <span className="text-xs text-zinc-600">未読のみ</span>
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-900">
        {articles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-700 gap-1">
            <p className="text-xs">記事を読み込み中...</p>
          </div>
        )}

        {articles.length > 0 && filtered.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-700">
            <p className="text-xs">記事がありません</p>
          </div>
        )}

        {visible.map((article) => {
          const isRead = readIds.has(article.id);
          const isSelected = selectedArticleId === article.id;
          return (
            <div
              key={article.id}
              onClick={() => onSelectArticle(article)}
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
                <span className="text-xs text-zinc-700">{timeAgo(article.publishedAt)}</span>
              </div>
              {!isRead && (
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
              )}
            </div>
          );
        })}

        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full py-3 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            さらに読み込む ({filtered.length - visible.length} 件)
          </button>
        )}
      </div>
    </section>
  );
}
