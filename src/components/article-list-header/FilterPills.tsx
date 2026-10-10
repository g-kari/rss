"use client";

import { useId, useMemo, useState } from "react";
import type { Feed } from "../../types";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { SHORTCUT_MAP } from "../../config/shortcuts";
import { READING_TIME_RANGE_LABELS, DATE_RANGE_LABELS } from "../../lib/article-utils";
import FilterPillButton from "./FilterPillButton";
import { PILL_ACTIVE_CLASSES, PILL_BASE_CLASS, PILL_INACTIVE_CLASS } from "./constants";
import SortButton from "./SortButton";
import MarkAllReadButton from "./MarkAllReadButton";
import CategoryFilter from "./CategoryFilter";

interface FilterPillsProps {
  selectedFeedId: string | null;
  feeds: Feed[];
  onOpenGlobalFilter: () => void;
  globalFilterActive: boolean;
  onMarkAllRead?: () => void;
}

export default function FilterPills({
  selectedFeedId,
  feeds,
  onOpenGlobalFilter,
  globalFilterActive,
  onMarkAllRead,
}: FilterPillsProps) {
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
    authorFilter,
    setAuthorFilter,
    categoryFilter,
    setCategoryFilter,
    rawQuery,
    resetAllFilters,
  } = useArticleFilter();

  const anyFilterActive =
    unreadOnly ||
    bookmarkOnly ||
    readingListOnly ||
    likeOnly ||
    noteOnly ||
    digestMode ||
    dateRange !== "all" ||
    readingTimeRange !== "all" ||
    Boolean(authorFilter) ||
    Boolean(categoryFilter) ||
    rawQuery.length > 0;

  const feedCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const feed of feeds) {
      if (feed.category != null) categories.add(feed.category);
    }
    return [...categories].sort();
  }, [feeds]);

  const detailId = useId();
  const [detailOpen, setDetailOpen] = useState(false);
  const secondaryActive =
    digestMode ||
    dateRange !== "all" ||
    readingTimeRange !== "all" ||
    Boolean(categoryFilter) ||
    globalFilterActive;
  const detailShown = detailOpen || secondaryActive;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex flex-wrap items-center gap-1 md:gap-2 min-w-0">
        <FilterPillButton
          active={unreadOnly}
          onClick={toggleUnreadOnly}
          title={`${SHORTCUT_MAP["u"]} (u)`}
        >
          <svg
            aria-hidden="true"
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
          <span className="ml-1">未読</span>
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
            aria-hidden="true"
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
          title={`${SHORTCUT_MAP["N"]} (N)`}
          variant="note"
        >
          ✎
        </FilterPillButton>
        {authorFilter && (
          <button
            onClick={() => setAuthorFilter(null)}
            title={`著者「${authorFilter}」フィルターを解除`}
            aria-label={`著者「${authorFilter}」フィルターを解除`}
            className="flex items-center gap-1 px-2 py-0.5 min-w-10 min-h-[44px] [@media(pointer:fine)]:min-w-8 [@media(pointer:fine)]:min-h-8 rounded text-control font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
          >
            <span className="truncate">{authorFilter}</span>
            <svg
              aria-hidden="true"
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
        <SortButton sortOrder={sortOrder} onToggle={toggleSortOrder} />
        {anyFilterActive && (
          <button
            onClick={resetAllFilters}
            title="すべてのフィルターをクリア"
            aria-label="すべてのフィルターをクリア"
            className="flex items-center gap-1 px-2 min-w-10 min-h-[44px] [@media(pointer:fine)]:min-w-8 [@media(pointer:fine)]:min-h-8 rounded text-control text-text-faint hover:text-text-strong hover:bg-surface-subtle transition-all duration-200"
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
            <span>クリア</span>
          </button>
        )}
        {onMarkAllRead && <MarkAllReadButton onMarkAllRead={onMarkAllRead} />}
        <button
          type="button"
          onClick={() => {
            if (!secondaryActive) setDetailOpen((open) => !open);
          }}
          aria-expanded={detailShown}
          aria-controls={detailShown ? detailId : undefined}
          aria-disabled={secondaryActive || undefined}
          title={
            secondaryActive
              ? "適用中の詳細フィルターがあるため表示しています"
              : "詳細フィルター（ダイジェスト・日付・読了時間・カテゴリ・全体キーワード）"
          }
          aria-label="絞り込み（詳細フィルター）"
          className={`${PILL_BASE_CLASS} gap-1 ${
            detailShown ? PILL_ACTIVE_CLASSES.default : PILL_INACTIVE_CLASS
          }`}
        >
          <svg
            aria-hidden="true"
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
          <span>絞り込み</span>
        </button>
      </div>
      {detailShown && (
        <div id={detailId} className="flex flex-wrap items-center gap-1 md:gap-2 min-w-0">
          {!selectedFeedId && (
            <FilterPillButton
              active={digestMode}
              onClick={toggleDigestMode}
              title={`${SHORTCUT_MAP["D"]} (D)`}
            >
              <svg
                aria-hidden="true"
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
              aria-hidden="true"
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
              aria-hidden="true"
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
          <CategoryFilter
            feedCategories={feedCategories}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
          />
          <button
            onClick={onOpenGlobalFilter}
            title="すべてのフィードにキーワードフィルターを設定"
            aria-label="グローバルフィルター設定"
            className={`flex items-center gap-1 px-2 min-w-10 min-h-[44px] [@media(pointer:fine)]:min-w-8 [@media(pointer:fine)]:min-h-8 rounded text-control transition-all duration-200 ${
              globalFilterActive
                ? "text-text-strong bg-surface-subtle"
                : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
            }`}
          >
            <svg
              aria-hidden="true"
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
        </div>
      )}
    </div>
  );
}
