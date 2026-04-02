"use client";

import {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import type { Article, Feed, KeywordFilter, Layout, DateRange, SortOrder } from "../types";
import FeedFilterModal from "./FeedFilterModal";
import { useOgpCache } from "../hooks/useOgpCache";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { isArticleRead } from "../lib/article-filter";
import Spinner from "./Spinner";
import {
  type ArticleItemProps,
  resolveThumbnail,
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
} from "./ArticleItems";

interface Props {
  feeds: Feed[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
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
  bookmarkOnly: boolean;
  toggleBookmarkOnly: () => void;
  readingListOnly: boolean;
  toggleReadingListOnly: () => void;
  sortOrder: SortOrder;
  toggleSortOrder: () => void;
  dateRange: DateRange;
  cycleDateRange: () => DateRange;
  query: string;
  rawQuery: string;
  updateQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  feedHasMorePages?: boolean;
  onLoadMoreFeedArticles?: () => Promise<void>;
  globalFilter?: KeywordFilter | null;
  onSaveGlobalFilter?: (filter: KeywordFilter | null) => void;
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

const LAYOUTS: Layout[] = ["compact", "list", "card", "magazine"];

const LAYOUT_LABELS: Record<Layout, string> = {
  compact: "コンパクト表示",
  list: "リスト表示",
  card: "カード表示",
  magazine: "マガジン表示",
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "日付",
  today: "今日",
  week: "今週",
  month: "今月",
};

// ── メインコンポーネント ───────────────────────────────────────────────

export default function ArticleList({
  feeds,
  readIds,
  readBeforeTimestamp = null,
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
  bookmarkOnly,
  toggleBookmarkOnly,
  readingListOnly,
  toggleReadingListOnly,
  sortOrder,
  toggleSortOrder,
  dateRange,
  cycleDateRange,
  query,
  rawQuery,
  updateQuery,
  searchRef,
  sentinelRef,
  feedHasMorePages,
  onLoadMoreFeedArticles,
  globalFilter,
  onSaveGlobalFilter,
}: Props) {
  const [globalFilterModalOpen, setGlobalFilterModalOpen] = useState(false);
  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title || f.url])), [feeds]);

  // 複数フィードを横断表示するとき（すべて・ブックマーク）はフィード名を表示する
  const showFeedName = selectedFeedId === null || selectedFeedId === SPECIAL_FEED_IDS.BOOKMARKS;

  const ogpCache = useOgpCache(visible);

  // 検索履歴
  const { history, addToHistory, removeFromHistory } = useSearchHistory();
  const [showHistory, setShowHistory] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // フォーカスが検索コンテナ外に移ったら履歴を閉じる
  const handleSearchBlur = useCallback((e: React.FocusEvent) => {
    if (!searchContainerRef.current?.contains(e.relatedTarget as Node)) {
      setShowHistory(false);
    }
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        updateQuery("");
        searchRef.current?.blur();
        setShowHistory(false);
      } else if (e.key === "Enter" && rawQuery.trim().length >= 2) {
        addToHistory(rawQuery.trim());
        setShowHistory(false);
      }
    },
    [rawQuery, updateQuery, addToHistory, searchRef],
  );

  const applyHistoryItem = useCallback(
    (q: string) => {
      updateQuery(q);
      addToHistory(q);
      setShowHistory(false);
      searchRef.current?.focus();
    },
    [updateQuery, addToHistory, searchRef],
  );

  useEffect(() => {
    if (selectedArticleId) {
      document
        .getElementById(`article-${selectedArticleId}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedArticleId]);

  /** 記事ごとの表示用状態を解決する（ハンドラは親の安定参照を直接渡す） */
  function resolveItemProps(article: Article, index: number): ArticleItemProps {
    return {
      article,
      index,
      isRead: isArticleRead(article, readIds, readBeforeTimestamp),
      isBookmarked: bookmarkIds.has(article.id),
      isSelected: selectedArticleId === article.id,
      feedName: feedMap.get(article.feedHash) ?? "",
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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 3L5 8l5 5" />
                </svg>
              </button>
            )}
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-muted">
              記事
              {filtered.length > 0 && (
                <span className="ml-1 text-text-faint">({filtered.length})</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* レイアウト切替 */}
            <div className="flex items-center gap-0.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  onClick={() => onChangeLayout(l)}
                  className={`w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
                    layout === l
                      ? "text-text-strong bg-surface-subtle"
                      : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                  }`}
                  title={LAYOUT_LABELS[l]}
                  aria-label={LAYOUT_LABELS[l]}
                  aria-pressed={layout === l}
                >
                  {LAYOUT_ICONS[l]}
                </button>
              ))}
            </div>
            <FilterPillButton active={unreadOnly} onClick={toggleUnreadOnly}>
              未読
            </FilterPillButton>
            <FilterPillButton
              active={bookmarkOnly}
              onClick={toggleBookmarkOnly}
              title="ブックマークフィルター切替 (B)"
              activeClass="border-bookmark bg-bookmark text-ink-text"
            >
              ★
            </FilterPillButton>
            <FilterPillButton
              active={readingListOnly}
              onClick={toggleReadingListOnly}
              title="リーディングリストフィルター切替 (T)"
            >
              後で
            </FilterPillButton>
            <FilterPillButton
              active={dateRange !== "all"}
              onClick={cycleDateRange}
              title="日付フィルター切り替え (d)"
            >
              {DATE_RANGE_LABELS[dateRange]}
            </FilterPillButton>
            <button
              onClick={toggleSortOrder}
              title={sortOrder === "newest" ? "古い順に切り替え (s)" : "新しい順に切り替え (s)"}
              className="w-6 h-6 flex items-center justify-center rounded-full text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-200"
            >
              {sortOrder === "newest" ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 1v10M2 7l4 4 4-4" />
                </svg>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 11V1M2 5l4-4 4 4" />
                </svg>
              )}
            </button>
            {onSaveGlobalFilter && (
              <button
                onClick={() => setGlobalFilterModalOpen(true)}
                title="すべてのフィードにキーワードフィルターを設定"
                className={`flex items-center gap-1 px-2 h-6 rounded-full text-[11px] transition-all duration-200 ${
                  globalFilter &&
                  (globalFilter.include.length > 0 || globalFilter.exclude.length > 0)
                    ? "text-text-strong bg-surface-subtle"
                    : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 2.5h10M3 6h6M5 9.5h2" />
                </svg>
                <span>グローバル</span>
              </button>
            )}
            {onMarkAllRead && (
              <button
                onClick={onMarkAllRead}
                title="全て既読にする (m)"
                className="w-6 h-6 flex items-center justify-center rounded-full text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-200"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="6" cy="6" r="4.5" />
                  <path d="M3.5 6l1.8 1.8L8.5 4" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="relative px-3 pb-2.5" ref={searchContainerRef} onBlur={handleSearchBlur}>
          <input
            ref={searchRef}
            type="search"
            placeholder="検索... (/ でフォーカス)"
            value={rawQuery}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (history.length > 0) setShowHistory(true);
            }}
            className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
          {showHistory && history.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden">
              {history.map((q) => (
                <div
                  key={q}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover cursor-pointer group"
                >
                  <button
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyHistoryItem(q);
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-text-faint flex-shrink-0"
                    >
                      <circle cx="5" cy="5" r="3.5" />
                      <path d="M8 8l2.5 2.5" />
                    </svg>
                    <span className="text-[11px] text-text-default truncate">{q}</span>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      removeFromHistory(q);
                    }}
                    title="履歴から削除"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="M1 1l6 6M7 1L1 7" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
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
        {layout === "compact" &&
          visible.map((a, i) => <CompactArticleItem key={a.id} {...resolveItemProps(a, i)} />)}

        {/* list */}
        {layout === "list" &&
          visible.map((a, i) => <ListArticleItem key={a.id} {...resolveItemProps(a, i)} />)}

        {/* card */}
        {layout === "card" && (
          <div className="grid grid-cols-2 gap-2 p-2">
            {visible.map((a, i) => (
              <CardArticleItem key={a.id} {...resolveItemProps(a, i)} />
            ))}
          </div>
        )}

        {/* magazine */}
        {layout === "magazine" && visible.length > 0 && (
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
        {!hasMore && feedHasMorePages && onLoadMoreFeedArticles && (
          <LoadMoreButton onLoad={onLoadMoreFeedArticles} />
        )}
      </div>
      {globalFilterModalOpen && onSaveGlobalFilter && (
        <FeedFilterModal
          initialFilter={globalFilter}
          onClose={() => setGlobalFilterModalOpen(false)}
          onSave={onSaveGlobalFilter}
        />
      )}
    </section>
  );
}

function FilterPillButton({
  active,
  onClick,
  title,
  children,
  activeClass = "border-ink bg-ink text-ink-text",
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200 ${
        active
          ? activeClass
          : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
      }`}
    >
      {children}
    </button>
  );
}

function LoadMoreButton({ onLoad }: { onLoad: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex justify-center py-4">
      <button
        onClick={async () => {
          setLoading(true);
          try {
            await onLoad();
          } finally {
            setLoading(false);
          }
        }}
        disabled={loading}
        className="flex items-center gap-1.5 text-[11px] tracking-[0.06em] px-3 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
      >
        {loading ? (
          <Spinner className="w-3 h-3" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 1v10M2 7l4 4 4-4" />
          </svg>
        )}
        {loading ? "読み込み中..." : "過去の記事を読み込む"}
      </button>
    </div>
  );
}
