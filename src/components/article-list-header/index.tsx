"use client";

import { useState } from "react";
import type { ArticleListHeaderProps } from "./types";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
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
  feeds,
}: ArticleListHeaderProps) {
  const [globalFilterModalOpen, setGlobalFilterModalOpen] = useState(false);
  const { globalFilter, setGlobalFilter } = useArticleFilter();

  const globalFilterActive =
    !!globalFilter && (globalFilter.include.length > 0 || globalFilter.exclude.length > 0);

  return (
    <>
      <div className="flex flex-col border-b border-border-default bg-surface-elevated">
        <div className="flex items-center gap-2 px-4 py-3 min-w-0 overflow-x-auto [&>*]:shrink-0">
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
          <LayoutSwitcher
            layout={layout}
            onChangeLayout={onChangeLayout}
            listFocusMode={listFocusMode}
            onToggleListFocusMode={onToggleListFocusMode}
          />
          <FilterPills
            selectedFeedId={selectedFeedId}
            feeds={feeds}
            onOpenGlobalFilter={() => setGlobalFilterModalOpen(true)}
            globalFilterActive={globalFilterActive}
            onMarkAllRead={onMarkAllRead}
          />
        </div>
        <SearchBar />
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
