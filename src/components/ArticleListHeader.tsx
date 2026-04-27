"use client";

import { useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import type { Feed, Layout, DateRange } from "../types";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { SHORTCUT_MAP } from "../config/shortcuts";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { useFullTextSearch } from "../hooks/useFullTextSearch";
import { useEventListener } from "../hooks/useEventListener";
import { READING_TIME_RANGE_LABELS } from "../lib/article-utils";
import LayoutIcon from "./LayoutIcon";
import FeedFilterModal from "./FeedFilterModal";

interface ArticleListHeaderProps {
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  listFocusMode: boolean;
  onToggleListFocusMode: () => void;
  onMobileBack?: () => void;
  onMarkAllRead?: () => void;
  filteredCount: number;
  selectedFeedId: string | null;
  feeds: Feed[];
}

const LAYOUTS: Layout[] = ["compact", "list", "card", "magazine", "gallery"];

const LAYOUT_LABELS: Record<Layout, string> = {
  compact: "コンパクト表示",
  list: "リスト表示",
  card: "カード表示",
  magazine: "マガジン表示",
  gallery: "ギャラリー表示",
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "日付",
  today: "今日",
  week: "今週",
  month: "今月",
};

const PILL_BASE_CLASS =
  "flex items-center justify-center text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200";
const PILL_INACTIVE_CLASS =
  "border-border-default text-text-muted hover:border-text-muted hover:text-text-default";
const PILL_ACTIVE_CLASSES = {
  default: "border-ink bg-ink text-ink-text",
  bookmark: "border-bookmark bg-bookmark text-ink-text",
  like: "border-rose-400 bg-rose-400 text-ink-text",
  note: "border-amber-400 bg-amber-400 text-ink-text",
} as const;

function FilterPillButton({
  active,
  onClick,
  title,
  children,
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  variant?: keyof typeof PILL_ACTIVE_CLASSES;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`${PILL_BASE_CLASS} ${active ? PILL_ACTIVE_CLASSES[variant] : PILL_INACTIVE_CLASS}`}
    >
      {children}
    </button>
  );
}

export default function ArticleListHeader({
  layout,
  onChangeLayout,
  listFocusMode,
  onToggleListFocusMode,
  onMobileBack,
  onMarkAllRead,
  filteredCount,
  selectedFeedId,
  feeds,
}: ArticleListHeaderProps) {
  const {
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    readingListOnly,
    toggleReadingListOnly,
    likeOnly,
    toggleLikeOnly,
    noteOnly,
    toggleNoteOnly,
    digestMode,
    toggleDigestMode,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    readingTimeRange,
    cycleReadingTimeRange,
    rawQuery,
    updateQuery,
    searchRef,
    globalFilter,
    setGlobalFilter,
    authorFilter,
    setAuthorFilter,
    categoryFilter,
    setCategoryFilter,
  } = useArticleFilter();

  const [globalFilterModalOpen, setGlobalFilterModalOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);
  const confirmMarkAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const feedCategories = useMemo(
    () => [...new Set(feeds.map((f) => f.category).filter(Boolean) as string[])].sort(),
    [feeds],
  );

  const { history, addToHistory, removeFromHistory } = useSearchHistory();
  const [showHistory, setShowHistory] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { savedSearches, save: saveSearch, removeSaved } = useFullTextSearch();

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

  useEventListener(
    "mousedown",
    (e) => {
      if (!categoryDropdownOpen) return;
      if (!categoryDropdownRef.current?.contains(e.target as Node)) setCategoryDropdownOpen(false);
    },
    document,
  );

  return (
    <>
      <div className="flex flex-col border-b border-border-default bg-surface-elevated">
        <div className="flex items-center gap-2 px-4 py-3 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
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
              {filteredCount > 0 && <span className="ml-1 text-text-faint">({filteredCount})</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto min-w-0">
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
                  <LayoutIcon layout={l} />
                </button>
              ))}
            </div>
            {/* 記事一覧フォーカスモード切替 */}
            <button
              onClick={onToggleListFocusMode}
              className={`w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
                listFocusMode
                  ? "text-text-strong bg-surface-subtle"
                  : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
              }`}
              title={listFocusMode ? "記事一覧フォーカス終了 (|)" : "記事一覧フォーカス (|)"}
              aria-label={listFocusMode ? "記事一覧フォーカス終了" : "記事一覧フォーカス"}
              aria-pressed={listFocusMode}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {listFocusMode ? (
                  <>
                    <path d="M9 9L3 3m0 0h6m-6 0v6" />
                    <path d="M15 9l6-6m0 0h-6m6 0v6" />
                    <path d="M9 15l-6 6m0 0h6m-6 0v-6" />
                    <path d="M15 15l6 6m0 0h-6m6 0v-6" />
                  </>
                ) : (
                  <>
                    <path d="M3 9V3m0 0h6M3 3l6 6" />
                    <path d="M21 9V3m0 0h-6m6 0l-6 6" />
                    <path d="M3 15v6m0 0h6m-6 0l6-6" />
                    <path d="M21 15v6m0 0h-6m6 0l-6-6" />
                  </>
                )}
              </svg>
            </button>
            <FilterPillButton
              active={unreadOnly}
              onClick={toggleUnreadOnly}
              title={`${SHORTCUT_MAP["u"]} (u)`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6z" />
                <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </FilterPillButton>
            <FilterPillButton
              active={bookmarkOnly}
              onClick={toggleBookmarkOnly}
              title={`${SHORTCUT_MAP["B"]} (B)`}
              variant="bookmark"
            >
              ★
            </FilterPillButton>
            <FilterPillButton
              active={readingListOnly}
              onClick={toggleReadingListOnly}
              title={`${SHORTCUT_MAP["T"]} (T)`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="6" r="4.5" />
                <path d="M6 3.5V6l1.5 1.5" />
              </svg>
            </FilterPillButton>
            <FilterPillButton
              active={likeOnly}
              onClick={toggleLikeOnly}
              title={`${SHORTCUT_MAP["I"]} (I)`}
              variant="like"
            >
              ♥
            </FilterPillButton>
            <FilterPillButton
              active={noteOnly}
              onClick={toggleNoteOnly}
              title="メモありフィルター切替"
              variant="note"
            >
              ✎
            </FilterPillButton>
            {!selectedFeedId && (
              <FilterPillButton
                active={digestMode}
                onClick={toggleDigestMode}
                title={`${SHORTCUT_MAP["D"]} (D)`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1.5 4.5l4.5-3 4.5 3-4.5 3-4.5-3z" />
                  <path d="M1.5 7.5l4.5 3 4.5-3" />
                </svg>
              </FilterPillButton>
            )}
            <FilterPillButton
              active={dateRange !== "all"}
              onClick={cycleDateRange}
              title={`${SHORTCUT_MAP["d"]}: ${DATE_RANGE_LABELS[dateRange]} (d)`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
                <path d="M1.5 5.5h9M4 1v3M8 1v3" />
              </svg>
            </FilterPillButton>
            <FilterPillButton
              active={readingTimeRange !== "all"}
              onClick={cycleReadingTimeRange}
              title={`読了時間フィルター: ${READING_TIME_RANGE_LABELS[readingTimeRange]}`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="7" r="4" />
                <path d="M6 4V2M4.5 1.5h3M6 5.5V7l1.5 1" />
              </svg>
            </FilterPillButton>
            {authorFilter && setAuthorFilter && (
              <button
                onClick={() => setAuthorFilter(null)}
                title={`著者「${authorFilter}」フィルターを解除`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
              >
                <span className="truncate">{authorFilter}</span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M1 1l6 6M7 1L1 7" />
                </svg>
              </button>
            )}
            {/* カテゴリフィルター */}
            {setCategoryFilter && feedCategories.length > 0 && (
              <div className="relative" ref={categoryDropdownRef}>
                {categoryFilter ? (
                  <button
                    onClick={() => setCategoryFilter(null)}
                    title={`カテゴリ「${categoryFilter}」フィルターを解除`}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
                  >
                    <span className="truncate">{categoryFilter}</span>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M1 1l6 6M7 1L1 7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => setCategoryDropdownOpen((v) => !v)}
                    title="カテゴリでフィルター"
                    className={`flex items-center gap-1 px-2 h-6 rounded-full text-[11px] transition-all duration-200 ${
                      categoryDropdownOpen
                        ? "text-text-strong bg-surface-subtle"
                        : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                    }`}
                  >
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
                      <path d="M1 3h10M3 6h6M5 9h2" />
                    </svg>
                    <span>フォルダ</span>
                  </button>
                )}
                {categoryDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-20 min-w-[120px] bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden">
                    {feedCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setCategoryFilter(cat);
                          setCategoryDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-text-default hover:bg-surface-hover transition-colors truncate"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            <button
              onClick={() => setGlobalFilterModalOpen(true)}
              title="すべてのフィードにキーワードフィルターを設定"
              className={`flex items-center gap-1 px-2 h-6 rounded-full text-[11px] transition-all duration-200 ${
                globalFilter && (globalFilter.include.length > 0 || globalFilter.exclude.length > 0)
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
            </button>
            {onMarkAllRead && (
              <button
                onClick={() => {
                  if (confirmMarkAll) {
                    if (confirmMarkAllTimerRef.current)
                      clearTimeout(confirmMarkAllTimerRef.current);
                    confirmMarkAllTimerRef.current = null;
                    setConfirmMarkAll(false);
                    onMarkAllRead();
                  } else {
                    setConfirmMarkAll(true);
                    confirmMarkAllTimerRef.current = setTimeout(() => {
                      setConfirmMarkAll(false);
                      confirmMarkAllTimerRef.current = null;
                    }, 3000);
                  }
                }}
                title={
                  confirmMarkAll ? "もう一度押すと全て既読にします" : `${SHORTCUT_MAP["m"]} (m)`
                }
                className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                  confirmMarkAll
                    ? "px-2 h-6 text-[10px] font-medium text-rose-400 border border-rose-400 hover:bg-rose-400/10"
                    : "w-6 h-6 text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                }`}
              >
                {confirmMarkAll ? (
                  "全既読?"
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
                    <circle cx="6" cy="6" r="4.5" />
                    <path d="M3.5 6l1.8 1.8L8.5 4" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
        <div className="relative px-3 pb-2.5" ref={searchContainerRef} onBlur={handleSearchBlur}>
          <input
            ref={searchRef}
            type="search"
            placeholder="検索... (/ でフォーカス、title:foo OR -bar 等)"
            value={rawQuery}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (history.length > 0 || savedSearches.length > 0) setShowHistory(true);
            }}
            className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg pl-2.5 pr-9 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
          {rawQuery.trim().length >= 2 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const name = window.prompt("保存名を入力してください", rawQuery.trim());
                if (name && name.trim()) saveSearch(name, rawQuery.trim());
              }}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text-strong transition-colors px-1.5 py-0.5"
              title="この検索条件を保存"
            >
              保存
            </button>
          )}
          {showHistory && (savedSearches.length > 0 || history.length > 0) && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {savedSearches.length > 0 && (
                <>
                  <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                    保存済み
                  </div>
                  {savedSearches.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover cursor-pointer group"
                    >
                      <button
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyHistoryItem(s.query);
                        }}
                        title={s.query}
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
                          className="text-bookmark flex-shrink-0"
                        >
                          <path d="M3 1.5h6v9l-3-2-3 2z" />
                        </svg>
                        <span className="text-[11px] text-text-default truncate">{s.name}</span>
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          removeSaved(s.id);
                        }}
                        title="保存検索を削除"
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
                  {history.length > 0 && (
                    <div className="border-t border-border-subtle mt-1 px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                      履歴
                    </div>
                  )}
                </>
              )}
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
      {globalFilterModalOpen && (
        <FeedFilterModal
          initialFilter={globalFilter}
          onClose={() => setGlobalFilterModalOpen(false)}
          onSave={setGlobalFilter}
        />
      )}
    </>
  );
}
