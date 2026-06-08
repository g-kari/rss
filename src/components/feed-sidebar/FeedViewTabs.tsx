"use client";

import { type DragEvent, type KeyboardEvent, type ReactNode, useCallback, useState } from "react";
import type { FeedView } from "../../types";

const DRAG_DATA_TYPE = "application/x-rss-feed-id";

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
        aria-hidden="true"
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
        aria-hidden="true"
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
        aria-hidden="true"
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
        aria-hidden="true"
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
  onDropFeedOnView,
}: {
  activeView: FeedView;
  onChangeView: (view: FeedView) => void;
  onDropFeedOnView?: (feedId: string, view: FeedView) => void;
}) {
  const [dragOverTab, setDragOverTab] = useState<FeedView | null>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_DATA_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback((e: DragEvent, view: FeedView) => {
    if (!e.dataTransfer.types.includes(DRAG_DATA_TYPE)) return;
    e.preventDefault();
    setDragOverTab(view);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    setDragOverTab(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent, view: FeedView) => {
      e.preventDefault();
      setDragOverTab(null);
      const feedId = e.dataTransfer.getData(DRAG_DATA_TYPE);
      if (feedId && onDropFeedOnView) onDropFeedOnView(feedId, view);
    },
    [onDropFeedOnView],
  );

  // WAI-ARIA Authoring Practices: role=tab キーボードナビゲーション (#903)
  // UserSettingsModal.tsx の canonical パターンを移植
  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = FEED_VIEW_TABS.findIndex((t) => t.id === activeView);
      let nextIndex = -1;
      if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % FEED_VIEW_TABS.length;
      else if (e.key === "ArrowLeft")
        nextIndex = (currentIndex - 1 + FEED_VIEW_TABS.length) % FEED_VIEW_TABS.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = FEED_VIEW_TABS.length - 1;
      if (nextIndex < 0) return;
      e.preventDefault();
      const nextTab = FEED_VIEW_TABS[nextIndex];
      onChangeView(nextTab.id);
      // フォーカスを次のタブボタンに移動 (roving tabindex pattern)。tablist (e.currentTarget) に
      // scope して querySelector する (document.getElementById の scope 漏れ防止、#tablist-scope canonical)。
      const nextEl = e.currentTarget.querySelector<HTMLElement>(`#feed-view-tab-${nextTab.id}`);
      nextEl?.focus();
    },
    [activeView, onChangeView],
  );

  return (
    <div
      role="tablist"
      aria-label="フィードビュー"
      onKeyDown={handleTabKeyDown}
      className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border-subtle"
    >
      {FEED_VIEW_TABS.map((t) => {
        const isActive = activeView === t.id;
        const isDragOver = dragOverTab === t.id;
        return (
          <button
            key={t.id}
            id={`feed-view-tab-${t.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls="feed-view-panel"
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChangeView(t.id)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, t.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, t.id)}
            className={`flex-1 flex items-center justify-center gap-1 px-1 min-h-[44px] rounded transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
              isDragOver
                ? "ring-2 ring-inset ring-text-muted bg-surface-subtle text-text-strong"
                : isActive
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
