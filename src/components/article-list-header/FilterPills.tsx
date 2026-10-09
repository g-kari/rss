"use client";

import { useMemo } from "react";
import type { Feed } from "../../types";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { SHORTCUT_MAP } from "../../config/shortcuts";
import { READING_TIME_RANGE_LABELS, DATE_RANGE_LABELS } from "../../lib/article-utils";
import FilterPillButton from "./FilterPillButton";

interface FilterPillsProps {
  selectedFeedId: string | null;
  feeds: Feed[];
  onOpenGlobalFilter: () => void;
  globalFilterActive: boolean;
}

/** Advanced conditions live in a labeled, wrapping dialog, never a clipped icon strip. */
export default function FilterPills({
  selectedFeedId,
  feeds,
  onOpenGlobalFilter,
  globalFilterActive,
}: FilterPillsProps) {
  const f = useArticleFilter();
  const categories = useMemo(
    () =>
      [
        ...new Set(
          feeds.map((feed) => feed.category).filter((value): value is string => value != null),
        ),
      ].sort(),
    [feeds],
  );
  return (
    <div className="p-4 space-y-5">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-control font-medium text-text-strong">記事の状態</legend>
        <div className="flex flex-wrap gap-2">
          <FilterPillButton
            active={f.unreadOnly}
            onClick={f.toggleUnreadOnly}
            title={`${SHORTCUT_MAP["u"]} (u)`}
          >
            未読
          </FilterPillButton>
          <FilterPillButton
            active={f.bookmarkOnly}
            onClick={f.toggleBookmarkOnly}
            title={`${SHORTCUT_MAP["B"]} (B)`}
            variant="bookmark"
          >
            ブックマーク
          </FilterPillButton>
          <FilterPillButton
            active={f.readingListOnly}
            onClick={f.toggleReadingListOnly}
            title={`${SHORTCUT_MAP["T"]} (T)`}
          >
            後で読む
          </FilterPillButton>
          <FilterPillButton
            active={f.likeOnly}
            onClick={f.toggleLikeOnly}
            title={`${SHORTCUT_MAP["I"]} (I)`}
            variant="like"
          >
            いいね
          </FilterPillButton>
          <FilterPillButton
            active={f.noteOnly}
            onClick={f.toggleNoteOnly}
            title={`${SHORTCUT_MAP["N"]} (N)`}
            variant="note"
          >
            メモあり
          </FilterPillButton>
          {!selectedFeedId && (
            <FilterPillButton
              active={f.digestMode}
              onClick={f.toggleDigestMode}
              title={`${SHORTCUT_MAP["D"]} (D)`}
            >
              ダイジェスト
            </FilterPillButton>
          )}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-control font-medium text-text-strong">期間・読了時間</legend>
        <div className="flex flex-wrap gap-2">
          <FilterPillButton
            active={f.dateRange !== "all"}
            onClick={f.cycleDateRange}
            title={`${SHORTCUT_MAP["d"]}: ${DATE_RANGE_LABELS[f.dateRange]} (d)`}
          >
            日付: {DATE_RANGE_LABELS[f.dateRange]}
          </FilterPillButton>
          <FilterPillButton
            active={f.readingTimeRange !== "all"}
            onClick={f.cycleReadingTimeRange}
            title={`読了時間フィルター: ${READING_TIME_RANGE_LABELS[f.readingTimeRange]}`}
          >
            読了時間: {READING_TIME_RANGE_LABELS[f.readingTimeRange]}
          </FilterPillButton>
        </div>
      </fieldset>
      {categories.length > 0 && (
        <label className="flex flex-col gap-2 text-control text-text-default">
          カテゴリ
          <select
            aria-label="カテゴリでフィルター"
            value={f.categoryFilter ?? ""}
            onChange={(event) => f.setCategoryFilter(event.target.value || null)}
            className="min-h-[44px] px-3 rounded-lg border border-border-default bg-surface-base text-text-strong"
          >
            <option value="">すべてのカテゴリ</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
      )}
      {f.authorFilter && (
        <button
          onClick={() => f.setAuthorFilter(null)}
          className="min-h-[44px] px-3 text-control text-text-default border border-border-default rounded-lg break-words"
          aria-label={`著者「${f.authorFilter}」フィルターを解除`}
        >
          著者: {f.authorFilter} ×
        </button>
      )}
      <button
        onClick={onOpenGlobalFilter}
        aria-label="グローバルフィルター設定"
        className="w-full min-h-[44px] px-3 py-2 border border-border-default rounded-lg text-control text-text-default text-left"
      >
        すべてのフィードのキーワード設定{globalFilterActive && "（設定あり）"}
      </button>
      <button
        onClick={f.resetAllFilters}
        className="min-h-[44px] px-3 rounded-lg text-control text-text-muted hover:bg-surface-hover"
        aria-label="すべてのフィルターをクリア"
      >
        絞り込みと検索をクリア
      </button>
    </div>
  );
}
