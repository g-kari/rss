"use client";

import type { SortOrder } from "../../types";

interface SortButtonProps {
  sortOrder: SortOrder;
  onToggle: () => void;
}

export default function SortButton({ sortOrder, onToggle }: SortButtonProps) {
  return (
    <button
      onClick={onToggle}
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
  );
}
