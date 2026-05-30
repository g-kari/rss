"use client";

import { formatCount } from "../../lib/article-utils";

export default function SpecialViewButton({
  id,
  label,
  count,
  selectedFeedId,
  onSelectFeed,
}: {
  id: string;
  label: string;
  count?: number;
  selectedFeedId: string | null;
  onSelectFeed: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectFeed(id)}
      aria-current={selectedFeedId === id ? "page" : undefined}
      className={`w-full flex items-center justify-between gap-2 px-4 min-h-[44px] text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset ${
        selectedFeedId === id
          ? "text-text-strong bg-surface-subtle"
          : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
      }`}
    >
      <span className="text-[13px] tracking-[0.02em] truncate min-w-0">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}
