import { useState, useMemo, useEffect, type ReactElement } from 'react';
import type { Article, Feed, Layout } from '../types';

interface Props {
  articles: Article[];
  feeds: Feed[];
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  selectedArticleId: string | null;
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
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

const LAYOUT_ICONS: Record<Layout, ReactElement> = {
  compact: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <rect x="0" y="1" width="13" height="1.5" rx="0.75" />
      <rect x="0" y="5" width="13" height="1.5" rx="0.75" />
      <rect x="0" y="9" width="13" height="1.5" rx="0.75" />
    </svg>
  ),
  list: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <rect x="0" y="0.5" width="13" height="2" rx="0.75" />
      <rect x="0" y="4" width="9" height="1" rx="0.5" />
      <rect x="0" y="7" width="13" height="2" rx="0.75" />
      <rect x="0" y="10.5" width="9" height="1" rx="0.5" />
    </svg>
  ),
  card: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <rect x="0" y="0" width="5.5" height="5.5" rx="1" />
      <rect x="7.5" y="0" width="5.5" height="5.5" rx="1" />
      <rect x="0" y="7.5" width="5.5" height="5.5" rx="1" />
      <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" />
    </svg>
  ),
  magazine: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <rect x="0" y="0" width="13" height="7" rx="1" />
      <rect x="0" y="9" width="5.5" height="4" rx="0.75" />
      <rect x="7.5" y="9" width="5.5" height="4" rx="0.75" />
    </svg>
  ),
};

const LAYOUTS: Layout[] = ['compact', 'list', 'card', 'magazine'];

export default function ArticleList({
  articles,
  feeds,
  feedId,
  readIds,
  bookmarkIds,
  selectedArticleId,
  layout,
  onChangeLayout,
  onSelectArticle,
}: Props) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title || f.url])), [feeds]);

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

  function handleSelect(article: Article) {
    onSelectArticle(article);
  }

  /* ── compact ── */
  function renderCompact(article: Article, i: number) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    return (
      <div
        key={article.id}
        id={`article-${article.id}`}
        onClick={() => handleSelect(article)}
        className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer border-b border-border-subtle transition-all duration-200 animate-fade-up ${
          isSelected
            ? 'bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]'
            : 'hover:bg-surface-hover'
        }`}
        style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
      >
        <span className={`w-1 h-1 rounded-full flex-shrink-0 ${!isRead ? 'bg-accent-dot' : 'bg-transparent'}`} />
        <span
          className={`text-[13px] truncate flex-1 transition-colors duration-200 ${
            isRead ? 'text-text-muted font-normal' : 'text-text-strong font-medium'
          }`}
        >
          {article.title || '(タイトルなし)'}
        </span>
        <span className="text-[11px] text-text-faint flex-shrink-0">{timeAgo(article.publishedAt)}</span>
      </div>
    );
  }

  /* ── list (デフォルト) ── */
  function renderList(article: Article, i: number) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    return (
      <div
        key={article.id}
        id={`article-${article.id}`}
        onClick={() => handleSelect(article)}
        className={`flex items-start gap-2.5 px-4 py-3 cursor-pointer border-b border-border-subtle transition-all duration-200 animate-fade-up ${
          isSelected
            ? 'bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]'
            : 'hover:bg-surface-hover'
        }`}
        style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
      >
        <div className="flex-1 min-w-0">
          <h3
            className={`text-[13px] leading-snug line-clamp-2 mb-1 transition-colors duration-200 ${
              isRead ? 'text-text-muted font-normal' : 'text-text-strong font-medium'
            }`}
          >
            {article.title || '(タイトルなし)'}
          </h3>
          {article.summary && (
            <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed mb-1">
              {article.summary}
            </p>
          )}
          <span className="text-[11px] text-text-faint">{timeAgo(article.publishedAt)}</span>
        </div>
        {!isRead && (
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />
        )}
      </div>
    );
  }

  /* ── card ── */
  function renderCard(article: Article, i: number) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    const feedName = feedMap.get(article.feedId) ?? '';
    return (
      <div
        key={article.id}
        id={`article-${article.id}`}
        onClick={() => handleSelect(article)}
        className={`flex flex-col cursor-pointer rounded-lg border transition-all duration-200 animate-fade-up overflow-hidden ${
          isSelected
            ? 'border-text-strong bg-surface-elevated'
            : 'border-border-default hover:border-text-muted bg-surface-elevated'
        }`}
        style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
      >
        {article.ogImage && (
          <img
            src={article.ogImage}
            alt=""
            className="w-full h-24 object-cover flex-shrink-0"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="p-2.5 flex flex-col gap-1 flex-1">
          {feedName && (
            <span className="text-[10px] text-text-faint truncate tracking-[0.04em]">{feedName}</span>
          )}
          <h3
            className={`text-[12px] leading-snug line-clamp-2 ${
              isRead ? 'text-text-muted font-normal' : 'text-text-strong font-medium'
            }`}
          >
            {article.title || '(タイトルなし)'}
          </h3>
          {article.summary && !article.ogImage && (
            <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
              {article.summary}
            </p>
          )}
          <div className="flex items-center justify-between mt-auto pt-1">
            <span className="text-[10px] text-text-faint">{timeAgo(article.publishedAt)}</span>
            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />}
          </div>
        </div>
      </div>
    );
  }

  /* ── magazine ── */
  function renderMagazineFeatured(article: Article) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    const feedName = feedMap.get(article.feedId) ?? '';
    return (
      <div
        key={article.id}
        id={`article-${article.id}`}
        onClick={() => handleSelect(article)}
        className={`cursor-pointer border rounded-lg overflow-hidden transition-all duration-200 animate-fade-up ${
          isSelected
            ? 'border-text-strong bg-surface-elevated'
            : 'border-border-default hover:border-text-muted bg-surface-elevated'
        }`}
      >
        {article.ogImage && (
          <img
            src={article.ogImage}
            alt=""
            className="w-full h-36 object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="p-3">
          {feedName && (
            <span className="text-[10px] text-text-faint tracking-[0.06em] uppercase">{feedName}</span>
          )}
          <h3
            className={`text-[14px] leading-snug font-medium mt-0.5 mb-1.5 ${
              isRead ? 'text-text-muted' : 'text-text-strong'
            }`}
          >
            {article.title || '(タイトルなし)'}
          </h3>
          {article.summary && (
            <p className="text-[12px] text-text-muted line-clamp-2 leading-relaxed mb-2">
              {article.summary}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-faint">{timeAgo(article.publishedAt)}</span>
            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot" />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-base">
      {/* ヘッダー */}
      <div className="flex flex-col border-b border-border-default bg-surface-elevated">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] tracking-[0.12em] uppercase text-text-muted">
            記事{filtered.length > 0 && <span className="ml-1 text-text-faint">({filtered.length})</span>}
          </span>
          <div className="flex items-center gap-2">
            {/* レイアウト切替 */}
            <div className="flex items-center gap-0.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  onClick={() => onChangeLayout(l)}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-all duration-200 ${
                    layout === l
                      ? 'text-text-strong bg-surface-subtle'
                      : 'text-text-faint hover:text-text-muted hover:bg-surface-subtle'
                  }`}
                  title={l}
                >
                  {LAYOUT_ICONS[l]}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}
              className={`text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200 ${
                unreadOnly
                  ? 'border-ink bg-ink text-ink-text'
                  : 'border-border-default text-text-muted hover:border-text-muted hover:text-text-default'
              }`}
            >
              未読
            </button>
          </div>
        </div>
        <div className="px-3 pb-2.5">
          <input
            type="search"
            placeholder="検索..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {articles.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[12px] text-text-faint">読み込み中...</p>
          </div>
        )}
        {articles.length > 0 && filtered.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[12px] text-text-faint">記事がありません</p>
          </div>
        )}

        {/* compact */}
        {layout === 'compact' && visible.map((a, i) => renderCompact(a, i))}

        {/* list */}
        {layout === 'list' && visible.map((a, i) => renderList(a, i))}

        {/* card */}
        {layout === 'card' && (
          <div className="grid grid-cols-2 gap-2 p-2">
            {visible.map((a, i) => renderCard(a, i))}
          </div>
        )}

        {/* magazine */}
        {layout === 'magazine' && visible.length > 0 && (
          <>
            <div className="p-2">
              {renderMagazineFeatured(visible[0])}
            </div>
            {visible.slice(1).map((a, i) => renderCompact(a, i + 1))}
          </>
        )}

        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full py-4 text-[11px] tracking-[0.08em] text-text-faint hover:text-text-soft transition-colors duration-200"
          >
            さらに読み込む ({filtered.length - visible.length})
          </button>
        )}
      </div>
    </section>
  );
}
