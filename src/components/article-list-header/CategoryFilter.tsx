"use client";

import type { RefObject, Dispatch, SetStateAction } from "react";

interface CategoryFilterProps {
  feedCategories: string[];
  categoryFilter: string | null;
  setCategoryFilter: Dispatch<SetStateAction<string | null>>;
  categoryDropdownRef: RefObject<HTMLDivElement | null>;
  categoryDropdownOpen: boolean;
  setCategoryDropdownOpen: Dispatch<SetStateAction<boolean>>;
}

export default function CategoryFilter({
  feedCategories,
  categoryFilter,
  setCategoryFilter,
  categoryDropdownRef,
  categoryDropdownOpen,
  setCategoryDropdownOpen,
}: CategoryFilterProps) {
  if (feedCategories.length === 0) return null;

  return (
    <div className="relative" ref={categoryDropdownRef}>
      {categoryFilter ? (
        <button
          onClick={() => setCategoryFilter(null)}
          title={`カテゴリ「${categoryFilter}」フィルターを解除`}
          aria-label={`カテゴリ「${categoryFilter}」フィルターを解除`}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
        >
          <span className="truncate">{categoryFilter}</span>
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
      ) : (
        <button
          onClick={() => setCategoryDropdownOpen((v) => !v)}
          title="カテゴリでフィルター"
          aria-haspopup="menu"
          aria-expanded={categoryDropdownOpen}
          className={`flex items-center gap-1 px-2 h-6 max-md:min-h-[44px] max-md:min-w-[44px] rounded-full text-[11px] transition-all duration-200 ${
            categoryDropdownOpen
              ? "text-text-strong bg-surface-subtle"
              : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
          }`}
        >
          <svg
            aria-hidden="true"
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
        <div
          role="menu"
          aria-label="カテゴリ選択"
          className="absolute left-0 top-full mt-1 z-20 min-w-[120px] bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden"
        >
          {feedCategories.map((cat) => (
            <button
              key={cat}
              role="menuitem"
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
  );
}
