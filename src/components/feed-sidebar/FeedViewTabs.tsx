"use client";

import { type ReactNode } from "react";
import type { FeedView } from "../../types";

export const FEED_VIEW_TABS: { id: FeedView; label: string; icon: ReactNode }[] = [
  {
    id: "articles",
    label: "記事",
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <line x1="2.5" y1="3" x2="9.5" y2="3" />
        <line x1="2.5" y1="6" x2="9.5" y2="6" />
        <line x1="2.5" y1="9" x2="7" y2="9" />
      </svg>
    ),
  },
  {
    id: "pictures",
    label: "画像",
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <rect x="1.5" y="2" width="9" height="8" rx="1" />
        <circle cx="4.5" cy="5" r="1" fill="currentColor" />
        <path d="M1.5 8.5 L4 6 L7 9 L10.5 6" />
      </svg>
    ),
  },
  {
    id: "videos",
    label: "動画",
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <rect x="1.5" y="2.5" width="9" height="7" rx="1" />
        <path d="M5 5 L7.5 6 L5 7 Z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "social",
    label: "SNS",
    icon: (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="3" cy="4" r="1.5" />
        <circle cx="9" cy="4" r="1.5" />
        <path d="M1.5 10 C1.5 8, 3 7.5, 3 7.5 C3 7.5, 4.5 8, 4.5 10" />
        <path d="M7.5 10 C7.5 8, 9 7.5, 9 7.5 C9 7.5, 10.5 8, 10.5 10" />
      </svg>
    ),
  },
];

export default function FeedViewTabs({
  activeView,
  onChangeView,
}: {
  activeView: FeedView;
  onChangeView: (view: FeedView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="フィードビュー"
      className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border-subtle"
    >
      {FEED_VIEW_TABS.map((t) => {
        const isActive = activeView === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangeView(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 px-1 py-1 rounded transition-all duration-200 ${
              isActive
                ? "text-text-strong bg-surface-subtle"
                : "text-text-faint hover:text-text-default hover:bg-surface-hover"
            }`}
            title={t.label}
          >
            {t.icon}
            <span className="text-[10px] tracking-[0.05em]">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
