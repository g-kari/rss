"use client";

import { formatCount } from "../FeedItem";

export default function SpecialViewButton({
  id,
  label,
  count,
  selectedFeedId,
  onSelectFeed,
}: {
  id: string;
  label: string;
  count: number;
  selectedFeedId: string | null;
  onSelectFeed: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectFeed(id)}
      aria-current={selectedFeedId === id ? "page" : undefined}
      className={`w-full flex items-center justify-between gap-2 px-4 py-1.5 text-left transition-all duration-200 ${
        selectedFeedId === id
          ? "text-text-strong bg-surface-subtle"
          : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
      }`}
    >
      <span className="text-[13px] tracking-[0.02em] truncate min-w-0">{label}</span>
      {count > 0 && (
        <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}
