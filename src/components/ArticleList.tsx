'use client';

import { useMemo, useEffect, useRef, useState, memo, type ReactElement, type ReactNode, type RefObject } from 'react';
import type { Article, Feed, Layout, DateRange } from '../types';
import type { SortOrder } from '../hooks/useFilteredArticles';
import { readingTime } from '../lib/article-utils';
import { STORAGE_KEYS, storageGet, storageSet } from '../lib/storage';

interface ArticleActionsProps {
  isRead: boolean;
  isBookmarked: boolean;
  size?: 'sm' | 'md';
  onToggleRead: () => void;
  onToggleBookmark: () => void;
}

function ArticleActions({ isRead, isBookmarked, size = 'md', onToggleRead, onToggleBookmark }: ArticleActionsProps) {
  const btn = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  const icon = size === 'sm' ? 10 : 12;
  const bicon = size === 'sm' ? { w: 9, h: 11 } : { w: 11, h: 13 };
  return (
    <>
      <button
        onClick={onToggleRead}
        title={isRead ? '未読にする' : '既読にする'}
        className={`${btn} flex items-center justify-center rounded text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-150`}
      >
        {isRead ? (
          <svg width={icon} height={icon} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="4.5"/>
          </svg>
        ) : (
          <svg width={icon} height={icon} viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="6" r="3.5"/>
          </svg>
        )}
      </button>
      <button
        onClick={onToggleBookmark}
        title={isBookmarked ? 'ブックマーク解除' : 'ブックマーク'}
        className={`${btn} flex items-center justify-center rounded transition-all duration-150 ${
          isBookmarked ? 'text-bookmark' : 'text-text-faint hover:text-text-muted hover:bg-surface-subtle'
        }`}
      >
        <svg width={bicon.w} height={bicon.h} viewBox="0 0 11 13" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1h9v11l-4.5-3L1 12V1z"/>
        </svg>
      </button>
    </>
  );
}

function ReadingTimeBadge({ article }: { article: Article }) {
  const src = article.content ?? article.summary;
  const mins = src ? readingTime(src) : 0;
  return mins > 1 ? <span className="text-[11px] text-text-faint">約{mins}分</span> : null;
}

function ArticleThumbnail({ thumb, className }: { thumb: string; className: string }) {
  return (
    <img
      src={`/api/image-proxy?url=${encodeURIComponent(thumb)}`}
      alt=""
      className={className}
      loading="lazy"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

interface Props {
  feeds: Feed[];
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  selectedArticleId: string | null;
  selectedFeedId: string | null;
  layout: Layout;
  loading?: boolean;
  onChangeLayout: (layout: Layout) => void;
  onSelectArticle: (article: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onMarkAllRead?: () => void;
  onMobileBack?: () => void;
  // useFilteredArticles からの状態（App.tsx で管理）
  filtered: Article[];
  visible: Article[];
  hasMore: boolean;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  sortOrder: SortOrder;
  toggleSortOrder: () => void;
  dateRange: DateRange;
  cycleDateRange: () => void;
  query: string;
  rawQuery: string;
  updateQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

/** ogImage がない場合、キャッシュ → YouTube URL の順でサムネイルを解決 */
function resolveThumbnail(article: Article, ogpCache: Record<string, string>): string | undefined {
  if (article.ogImage) return article.ogImage;
  if (article.link && ogpCache[article.link]) return ogpCache[article.link];
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

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: '日付', today: '今日', week: '今週', month: '今月',
};

// ── 各レイアウト用記事アイテムの共通 Props ──────────────────────────────

interface ArticleItemProps {
  article: Article;
  index: number;
  isRead: boolean;
  isBookmarked: boolean;
  isSelected: boolean;
  feedName: string;
  thumb: string | undefined;
  showFeedName: boolean;
  query: string;
  // 親の安定参照をそのまま渡す（子側でクロージャを生成してメモ比較を壊さない）
  onSelectArticle: (a: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}

// ── compact ────────────────────────────────────────────────────────────

const CompactArticleItem = memo(function CompactArticleItem({
  article, index, isRead, isBookmarked, isSelected, feedName, showFeedName, query,
  onSelectArticle, onToggleRead, onToggleBookmark,
}: ArticleItemProps) {
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group flex items-center gap-2 px-4 py-1.5 cursor-pointer border-b border-border-subtle transition-all duration-200 animate-fade-up ${
        isSelected
          ? 'bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]'
          : 'hover:bg-surface-hover'
      }`}
      style={{ animationDelay: `${Math.min(index, 20) * 15}ms` }}
    >
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${!isRead ? 'bg-accent-dot' : 'bg-transparent'}`} />
      <span
        className={`text-[13px] truncate flex-1 transition-colors duration-200 ${
          isRead ? 'text-text-muted font-normal' : 'text-text-strong font-medium'
        }`}
      >
        {highlightText(article.title || '(タイトルなし)', query)}
      </span>
      {showFeedName && feedName && (
        <span className="text-[11px] text-text-faint truncate max-w-[80px] flex-shrink-0 group-hover:hidden">{feedName}</span>
      )}
      <span className="text-[11px] text-text-faint flex-shrink-0 group-hover:hidden">{timeAgo(article.publishedAt)}</span>
      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <ArticleActions isRead={isRead} isBookmarked={isBookmarked} onToggleRead={() => onToggleRead(article.id)} onToggleBookmark={() => onToggleBookmark(article.id)} />
      </div>
    </div>
  );
});

// ── list (デフォルト) ──────────────────────────────────────────────────

const ListArticleItem = memo(function ListArticleItem({
  article, index, isRead, isBookmarked, isSelected, feedName, thumb, showFeedName, query,
  onSelectArticle, onToggleRead, onToggleBookmark,
}: ArticleItemProps) {
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group flex items-start gap-2.5 px-4 py-3 cursor-pointer border-b border-border-subtle transition-all duration-200 animate-fade-up ${
        isSelected
          ? 'bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]'
          : 'hover:bg-surface-hover'
      }`}
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
    >
      <div className="flex-1 min-w-0">
        {showFeedName && feedName && (
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
          {article.author && <span className="text-[11px] text-text-faint truncate max-w-[100px]">{article.author}</span>}
          <ReadingTimeBadge article={article} />
          {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {thumb && <ArticleThumbnail thumb={thumb} className="w-14 h-14 object-cover rounded" />}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <ArticleActions isRead={isRead} isBookmarked={isBookmarked} onToggleRead={() => onToggleRead(article.id)} onToggleBookmark={() => onToggleBookmark(article.id)} />
        </div>
      </div>
    </div>
  );
});

// ── card ───────────────────────────────────────────────────────────────

const CardArticleItem = memo(function CardArticleItem({
  article, index, isRead, isBookmarked, isSelected, feedName, thumb, showFeedName, query,
  onSelectArticle, onToggleRead, onToggleBookmark,
}: ArticleItemProps) {
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group relative flex flex-col cursor-pointer rounded-lg border transition-all duration-200 animate-fade-up overflow-hidden ${
        isSelected
          ? 'border-text-strong bg-surface-elevated'
          : 'border-border-default hover:border-text-muted bg-surface-elevated'
      }`}
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
    >
      {thumb && <ArticleThumbnail thumb={thumb} className="w-full aspect-video object-contain bg-surface-subtle flex-shrink-0" />}
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        {showFeedName && feedName && (
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
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-text-faint flex-shrink-0">{timeAgo(article.publishedAt)}</span>
            {article.author && <span className="text-[10px] text-text-faint truncate">{article.author}</span>}
          </div>
          <>
            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0 group-hover:opacity-0 transition-opacity duration-150" />}
            <div className="absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto right-2.5 bottom-2.5" onClick={(e) => e.stopPropagation()}>
              <ArticleActions size="sm" isRead={isRead} isBookmarked={isBookmarked} onToggleRead={() => onToggleRead(article.id)} onToggleBookmark={() => onToggleBookmark(article.id)} />
            </div>
          </>
        </div>
      </div>
    </div>
  );
});

// ── magazine (フィーチャー記事) ────────────────────────────────────────

const MagazineFeaturedArticleItem = memo(function MagazineFeaturedArticleItem({
  article, isRead, isBookmarked, isSelected, feedName, thumb, showFeedName, query,
  onSelectArticle, onToggleRead, onToggleBookmark,
}: Omit<ArticleItemProps, 'index'>) {
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group relative cursor-pointer border rounded-lg overflow-hidden transition-all duration-200 animate-fade-up ${
        isSelected
          ? 'border-text-strong bg-surface-elevated'
          : 'border-border-default hover:border-text-muted bg-surface-elevated'
      }`}
    >
      {thumb && <ArticleThumbnail thumb={thumb} className="w-full aspect-video object-contain bg-surface-subtle" />}
      <div className="p-3">
        {showFeedName && feedName && (
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-faint">{timeAgo(article.publishedAt)}</span>
            <ReadingTimeBadge article={article} />
          </div>
          <div className="flex items-center">
            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot group-hover:opacity-0 transition-opacity duration-150" />}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <ArticleActions isRead={isRead} isBookmarked={isBookmarked} onToggleRead={() => onToggleRead(article.id)} onToggleBookmark={() => onToggleBookmark(article.id)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── メインコンポーネント ───────────────────────────────────────────────

export default function ArticleList({
  feeds,
  readIds,
  bookmarkIds,
  selectedArticleId,
  selectedFeedId,
  layout,
  loading = false,
  onChangeLayout,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onMarkAllRead,
  onMobileBack,
  filtered,
  visible,
  hasMore,
  unreadOnly,
  toggleUnreadOnly,
  sortOrder,
  toggleSortOrder,
  dateRange,
  cycleDateRange,
  query,
  rawQuery,
  updateQuery,
  searchRef,
  sentinelRef,
}: Props) {
  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title || f.url])), [feeds]);

  // 複数フィードを横断表示するとき（すべて・ブックマーク）はフィード名を表示する
  const showFeedName = selectedFeedId === null || selectedFeedId === '__bookmarks__';

  // ogImage がない記事の OGP 画像を遅延フェッチするキャッシュ（localStorage に永続化）
  const [ogpCache, setOgpCache] = useState<Record<string, string>>(() => {
    try {
      const stored = storageGet(STORAGE_KEYS.OGP_CACHE);
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const fetchingRef = useRef<Set<string>>(new Set());
  // setOgpCache 呼び出し後の再トリガーを避けるため ref で最新値を参照する
  const ogpCacheRef = useRef(ogpCache);
  ogpCacheRef.current = ogpCache;

  useEffect(() => {
    const toFetch = visible.filter(
      (a) => !a.ogImage && a.link && !ogpCacheRef.current[a.link] && !fetchingRef.current.has(a.link),
    ).slice(0, 5);
    if (toFetch.length === 0) return;
    toFetch.forEach((a) => {
      fetchingRef.current.add(a.link);
      fetch(`/api/ogp?url=${encodeURIComponent(a.link)}`)
        .then((r) => r.json() as Promise<{ image: string }>)
        .then(({ image }) => {
          if (image) {
            setOgpCache((prev) => {
              const next = { ...prev, [a.link]: image };
              // キャッシュが肥大化しないよう最大 200 件に制限
              const keys = Object.keys(next);
              if (keys.length > 200) {
                const trimmed = Object.fromEntries(keys.slice(-200).map((k) => [k, next[k]]));
                storageSet(STORAGE_KEYS.OGP_CACHE, JSON.stringify(trimmed));
                return trimmed;
              }
              storageSet(STORAGE_KEYS.OGP_CACHE, JSON.stringify(next));
              return next;
            });
          }
        })
        .catch((err) => { console.error('OGP fetch failed:', err); })
        .finally(() => { fetchingRef.current.delete(a.link); });
    });
  }, [visible]);

  useEffect(() => {
    if (selectedArticleId) {
      document
        .getElementById(`article-${selectedArticleId}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedArticleId]);

  /** 記事ごとの表示用状態を解決する（ハンドラは親の安定参照を直接渡す） */
  function resolveItemProps(article: Article, index: number): ArticleItemProps {
    return {
      article,
      index,
      isRead: readIds.has(article.id),
      isBookmarked: bookmarkIds.has(article.id),
      isSelected: selectedArticleId === article.id,
      feedName: feedMap.get(article.feedId) ?? '',
      thumb: resolveThumbnail(article, ogpCache),
      showFeedName,
      query,
      onSelectArticle,
      onToggleRead,
      onToggleBookmark,
    };
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
              onClick={cycleDateRange}
              title="日付フィルター切り替え (d)"
              className={`text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200 ${
                dateRange !== 'all'
                  ? 'border-ink bg-ink text-ink-text'
                  : 'border-border-default text-text-muted hover:border-text-muted hover:text-text-default'
              }`}
            >
              {DATE_RANGE_LABELS[dateRange]}
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
            {onMarkAllRead && (
              <button
                onClick={onMarkAllRead}
                title="全て既読にする (m)"
                className="w-6 h-6 flex items-center justify-center rounded text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-200"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="4.5"/>
                  <path d="M3.5 6l1.8 1.8L8.5 4"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="px-3 pb-2.5">
          <input
            ref={searchRef}
            type="search"
            placeholder="検索... (/ でフォーカス)"
            value={rawQuery}
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
        {layout === 'compact' && visible.map((a, i) => (
          <CompactArticleItem key={a.id} {...resolveItemProps(a, i)} />
        ))}

        {/* list */}
        {layout === 'list' && visible.map((a, i) => (
          <ListArticleItem key={a.id} {...resolveItemProps(a, i)} />
        ))}

        {/* card */}
        {layout === 'card' && (
          <div className="grid grid-cols-2 gap-2 p-2">
            {visible.map((a, i) => (
              <CardArticleItem key={a.id} {...resolveItemProps(a, i)} />
            ))}
          </div>
        )}

        {/* magazine */}
        {layout === 'magazine' && visible.length > 0 && (
          <>
            <div className="p-2">
              <MagazineFeaturedArticleItem {...resolveItemProps(visible[0], 0)} />
            </div>
            {visible.slice(1).map((a, i) => (
              <CompactArticleItem key={a.id} {...resolveItemProps(a, i + 1)} />
            ))}
          </>
        )}

        {hasMore && <div ref={sentinelRef} className="h-10" aria-hidden />}
      </div>
    </section>
  );
}
