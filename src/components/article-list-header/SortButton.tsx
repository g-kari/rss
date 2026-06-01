"use client";

import type { SortOrder } from "../../types";
import { SORT_ORDER_LABELS } from "../../lib/article-utils";

interface SortButtonProps {
  sortOrder: SortOrder;
  onToggle: () => void;
}

const NEXT_LABEL: Record<SortOrder, string> = {
  newest: "古い順に切り替え (s)",
  oldest: "読了時間順に切り替え (s)",
  readingTimeAsc: "新しい順に切り替え (s)",
};

export default function SortButton({ sortOrder, onToggle }: SortButtonProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={`現在: ${SORT_ORDER_LABELS[sortOrder]} — ${NEXT_LABEL[sortOrder]}`}
      title={NEXT_LABEL[sortOrder]}
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
          aria-hidden="true"
        >
          <path d="M6 1v10M2 7l4 4 4-4" />
        </svg>
      ) : sortOrder === "oldest" ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 11V1M2 5l4-4 4 4" />
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
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="4.5" />
          <path d="M6 3.2V6l1.7 1.7" />
        </svg>
      )}
    </button>
  );
}
