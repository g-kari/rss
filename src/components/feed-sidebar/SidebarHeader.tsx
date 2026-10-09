"use client";

import { useEffect, useRef } from "react";

interface Props {
  nsfwMode: boolean;
  inputOpen: boolean;
  refreshing: boolean;
  isOnline: boolean;
  onActivateNsfw: () => void;
  onDeactivateNsfw: () => void;
  onToggleInput: () => void;
  onRefresh: () => void;
}

export default function SidebarHeader({
  nsfwMode,
  inputOpen,
  refreshing,
  isOnline,
  onActivateNsfw,
  onDeactivateNsfw,
  onToggleInput,
  onRefresh,
}: Props) {
  const nsfwLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressLogoClickRef = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);

  const cancelLongPress = () => {
    if (nsfwLongPressTimerRef.current !== null) {
      clearTimeout(nsfwLongPressTimerRef.current);
      nsfwLongPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (nsfwLongPressTimerRef.current !== null) {
        clearTimeout(nsfwLongPressTimerRef.current);
        nsfwLongPressTimerRef.current = null;
      }
    };
  }, [nsfwMode]);

  const exitNsfw = () => {
    cancelLongPress();
    // The action disappears after exit. Keep focus on a stable, non-activating group
    // so a held/repeated Enter cannot accidentally start the logo activation flow.
    headerRef.current?.focus({ preventScroll: true });
    onDeactivateNsfw();
  };

  return (
    <div
      ref={headerRef}
      role="group"
      aria-label="サイドバー操作"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === " " && event.target === event.currentTarget) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className="border-b border-border-default"
    >
      <div className="px-3 py-3 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={(event) => {
            const suppressPointerClick = suppressLogoClickRef.current && event.detail > 0;
            suppressLogoClickRef.current = false;
            if (suppressPointerClick) return;
            onActivateNsfw();
          }}
          onPointerDown={(event) => {
            cancelLongPress();
            suppressLogoClickRef.current = false;
            if (!nsfwMode || event.button !== 0) return;
            nsfwLongPressTimerRef.current = setTimeout(() => {
              nsfwLongPressTimerRef.current = null;
              suppressLogoClickRef.current = true;
              onDeactivateNsfw();
            }, 600);
          }}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onContextMenu={(e) => {
            if (nsfwMode) e.preventDefault();
          }}
          className={`min-h-[44px] min-w-[44px] text-meta font-medium tracking-[0.25em] uppercase transition-colors duration-150 select-none cursor-default ${nsfwMode ? "text-error" : "text-text-muted"}`}
          title={nsfwMode ? "長押しでNSFWモード解除" : ""}
        >
          RSS
        </button>
        <button
          onClick={onToggleInput}
          disabled={!isOnline}
          className={`inline-flex items-center gap-1 px-2 min-h-[44px] min-w-[44px] rounded text-control font-medium transition-colors duration-150 disabled:opacity-40 ${
            inputOpen
              ? "bg-accent-subtle text-accent"
              : "bg-accent text-accent-contrast hover:bg-accent-hover"
          }`}
          title={!isOnline ? "オフラインです" : "フィードを追加"}
          aria-label={!isOnline ? "オフライン" : "フィードを追加"}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <line x1="5.5" y1="1" x2="5.5" y2="10" />
            <line x1="1" y1="5.5" x2="10" y2="5.5" />
          </svg>
          <span aria-hidden="true">追加</span>
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing || !isOnline}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-hover transition-colors duration-150 disabled:opacity-40"
          title={!isOnline ? "オフラインです" : "フィードを更新"}
          aria-label={!isOnline ? "オフライン" : refreshing ? "フィードを更新中" : "フィードを更新"}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={refreshing ? "animate-spin" : ""}
            aria-hidden="true"
          >
            <path strokeLinecap="round" d="M9.5 2A4.5 4.5 0 1 0 10 6.5" />
            <polyline strokeLinecap="round" strokeLinejoin="round" points="7.5,0.5 9.5,2 8,4" />
          </svg>
        </button>
      </div>
      {nsfwMode && (
        <div className="px-4 pb-3.5">
          <button
            type="button"
            onClick={exitNsfw}
            onKeyDown={(event) => {
              // Keep native Space activation; the document-level article shortcut
              // must not prevent this button's default click or scroll its reader.
              if (event.key === " ") event.stopPropagation();
            }}
            className="w-full min-h-[44px] px-2 py-2 text-xs leading-4 font-medium rounded border border-border-default text-text-default hover:bg-surface-hover transition-colors duration-200"
            title="NSFWモード解除（開いている記事は閉じません）"
          >
            NSFWモード解除
          </button>
        </div>
      )}
    </div>
  );
}
