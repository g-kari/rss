"use client";

import { useState } from "react";
import type { ArticleListHeaderProps } from "./types";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { articleListScopeTitle } from "../../lib/article-list-scope";
import LayoutSwitcher from "./LayoutSwitcher";
import FilterPills from "./FilterPills";
import SearchBar from "./SearchBar";
import dynamic from "next/dynamic";

const FeedFilterModal = dynamic(() => import("../FeedFilterModal"), { ssr: false });

export default function ArticleListHeader({
  layout,
  onChangeLayout,
  listFocusMode,
  onToggleListFocusMode,
  onMobileBack,
  onMarkAllRead,
  filteredCount,
  selectedFeedId,
  scopeTitle,
  feeds,
}: ArticleListHeaderProps) {
  const [globalFilterModalOpen, setGlobalFilterModalOpen] = useState(false);
  const { globalFilter, setGlobalFilter } = useArticleFilter();

  const globalFilterActive =
    !!globalFilter && (globalFilter.include.length > 0 || globalFilter.exclude.length > 0);
  const title =
    scopeTitle ||
    articleListScopeTitle({
      feedId: selectedFeedId,
      feedTitle: feeds.find((feed) => feed.id === selectedFeedId)?.title,
    });

  return (
    <>
      <header className="flex flex-col border-b border-border-default bg-surface-elevated">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 pt-3 pb-1 min-w-0">
          <div className="flex items-center gap-1 min-w-[5rem] flex-1">
            {onMobileBack && (
              <button
                onClick={onMobileBack}
                className="lg:hidden -ml-1 mr-1 p-1.5 max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] flex items-center justify-center text-text-muted hover:text-text-strong transition-colors"
                aria-label="フィード一覧に戻る"
              >
                <svg
                  aria-hidden="true"
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
            <h2 className="flex items-baseline gap-1 min-w-0 text-meta text-text-muted">
              <span className="truncate" title={title}>
                {title}
              </span>
              <span className="shrink-0 tabular-nums" aria-label={`${filteredCount} 件`}>
                ({filteredCount})
              </span>
            </h2>
          </div>
          <LayoutSwitcher
            layout={layout}
            onChangeLayout={onChangeLayout}
            listFocusMode={listFocusMode}
            onToggleListFocusMode={onToggleListFocusMode}
          />
        </div>
        <div className="px-4 pb-2 min-w-0">
          <FilterPills
            selectedFeedId={selectedFeedId}
            feeds={feeds}
            onOpenGlobalFilter={() => setGlobalFilterModalOpen(true)}
            globalFilterActive={globalFilterActive}
            onMarkAllRead={onMarkAllRead}
          />
        </div>
        <SearchBar />
      </header>
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
