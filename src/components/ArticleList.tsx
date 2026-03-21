'use client';

import { useMemo, useEffect, type ReactElement, type ReactNode, type RefObject } from 'react';
import type { Article, Feed, Layout } from '../types';
import type { SortOrder } from '../hooks/useFilteredArticles';

interface Props {
  feeds: Feed[];
  readIds: Set<string>;
  selectedArticleId: string | null;
  selectedFeedId: string | null;
  layout: Layout;
  loading?: boolean;
  onChangeLayout: (layout: Layout) => void;
  onSelectArticle: (article: Article) => void;
  onMobileBack?: () => void;
  // useFilteredArticles からの状態（App.tsx で管理）
  filtered: Article[];
  visible: Article[];
  hasMore: boolean;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  sortOrder: SortOrder;
  toggleSortOrder: () => void;
  query: string;
  updateQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

/** ogImage がない場合、YouTube URL からサムネイルを生成 */
function resolveThumbnail(article: Article): string | undefined {
  if (article.ogImage) return article.ogImage;
  const yt = article.link?.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg`;
  return undefined;
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

/** 検索クエリに一致する箇所をハイライト表示 */
function highlightText(text: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const parts: ReactNode[] = [];
  let remaining = text;
  let lower = text.toLowerCase();
  let idx = lower.indexOf(q);
  let key = 0;
  while (idx !== -1) {
    if (idx > 0) parts.push(remaining.slice(0, idx));
    parts.push(
      <mark
        key={key++}
        style={{
          background: 'var(--color-highlight)',
          color: 'inherit',
          borderRadius: '2px',
          paddingInline: '1px',
        }}
      >
        {remaining.slice(idx, idx + q.length)}
      </mark>,
    );
    remaining = remaining.slice(idx + q.length);
    lower = remaining.toLowerCase();
    idx = lower.indexOf(q);
  }
  if (remaining) parts.push(remaining);
  return <>{parts}</>;
}

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
  feeds,
  readIds,
  selectedArticleId,
  selectedFeedId,
  layout,
  loading = false,
  onChangeLayout,
  onSelectArticle,
  onMobileBack,
  filtered,
  visible,
  hasMore,
  unreadOnly,
  toggleUnreadOnly,
  sortOrder,
  toggleSortOrder,
  query,
  updateQuery,
  searchRef,
  sentinelRef,
}: Props) {
  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title || f.url])), [feeds]);

  // 複数フィードを横断表示するとき（すべて・ブックマーク）はフィード名を表示する
  const showFeedName = selectedFeedId === null || selectedFeedId === '__bookmarks__';

  useEffect(() => {
    if (selectedArticleId) {
      document
        .getElementById(`article-${selectedArticleId}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedArticleId]);

  function handleSelect(article: Article) {
    onSelectArticle(article);
  }

  /* ── compact ── */
  function renderCompact(article: Article, i: number) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    const feedName = showFeedName ? (feedMap.get(article.feedId) ?? '') : '';
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
          {highlightText(article.title || '(タイトルなし)', query)}
        </span>
        {feedName && (
          <span className="text-[11px] text-text-faint truncate max-w-[80px] flex-shrink-0">{feedName}</span>
        )}
        <span className="text-[11px] text-text-faint flex-shrink-0">{timeAgo(article.publishedAt)}</span>
      </div>
    );
  }

  /* ── list (デフォルト) ── */
  function renderList(article: Article, i: number) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    const thumb = resolveThumbnail(article);
    const feedName = showFeedName ? (feedMap.get(article.feedId) ?? '') : '';
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
          {feedName && (
            <span className="text-[10px] text-text-faint tracking-[0.04em] mb-0.5 block truncate">{feedName}</span>
          )}
          <h3
            className={`text-[13px] leading-snug line-clamp-2 mb-1 transition-colors duration-200 ${
              isRead ? 'text-text-muted font-normal' : 'text-text-strong font-medium'
            }`}
          >
            {highlightText(article.title || '(タイトルなし)', query)}
          </h3>
          {article.summary && (
            <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed mb-1">
              {highlightText(article.summary, query)}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-faint">{timeAgo(article.publishedAt)}</span>
            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />}
          </div>
        </div>
        {thumb && (
          <img
            src={thumb}
            alt=""
            className="w-14 h-14 object-cover rounded flex-shrink-0"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
    );
  }

  /* ── card ── */
  function renderCard(article: Article, i: number) {
    const isRead = readIds.has(article.id);
    const isSelected = selectedArticleId === article.id;
    const feedName = feedMap.get(article.feedId) ?? '';
    const thumb = resolveThumbnail(article);
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
        {thumb && (
          <img
            src={thumb}
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
            {highlightText(article.title || '(タイトルなし)', query)}
          </h3>
          {article.summary && !thumb && (
            <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
              {highlightText(article.summary, query)}
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
    const thumb = resolveThumbnail(article);
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
        {thumb && (
          <img
            src={thumb}
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
            {highlightText(article.title || '(タイトルなし)', query)}
          </h3>
          {article.summary && (
            <p className="text-[12px] text-text-muted line-clamp-2 leading-relaxed mb-2">
              {highlightText(article.summary, query)}
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
    <section className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-base">
      {/* ヘッダー */}
      <div className="flex flex-col border-b border-border-default bg-surface-elevated">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            {onMobileBack && (
              <button
                onClick={onMobileBack}
                className="lg:hidden -ml-1 mr-1 p-1.5 text-text-muted hover:text-text-strong transition-colors"
                aria-label="フィード一覧に戻る"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
            )}
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-muted">
              記事{filtered.length > 0 && <span className="ml-1 text-text-faint">({filtered.length})</span>}
            </span>
          </div>
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
              onClick={toggleUnreadOnly}
              className={`text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200 ${
                unreadOnly
                  ? 'border-ink bg-ink text-ink-text'
                  : 'border-border-default text-text-muted hover:border-text-muted hover:text-text-default'
              }`}
            >
              未読
            </button>
            <button
              onClick={toggleSortOrder}
              title={sortOrder === 'newest' ? '古い順に切り替え (s)' : '新しい順に切り替え (s)'}
              className="w-6 h-6 flex items-center justify-center rounded text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-200"
            >
              {sortOrder === 'newest' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 1v10M2 7l4 4 4-4"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 11V1M2 5l4-4 4 4"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="px-3 pb-2.5">
          <input
            ref={searchRef}
            type="search"
            placeholder="検索... (/ でフォーカス)"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { updateQuery(''); searchRef.current?.blur(); }
            }}
            className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && filtered.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[12px] text-text-faint">読み込み中...</p>
          </div>
        )}
        {!loading && filtered.length === 0 && (
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

        {hasMore && <div ref={sentinelRef} className="h-10" aria-hidden />}
      </div>
    </section>
  );
}
