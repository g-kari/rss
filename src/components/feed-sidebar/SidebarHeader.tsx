"use client";

import { useRef } from "react";

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

  return (
    <div className="px-4 py-3.5 border-b border-border-default flex items-center justify-between gap-2 overflow-x-auto [&>*]:shrink-0">
      <button
        onClick={onActivateNsfw}
        onPointerDown={() => {
          if (!nsfwMode) return;
          nsfwLongPressTimerRef.current = setTimeout(() => {
            onDeactivateNsfw();
          }, 600);
        }}
        onPointerUp={() => {
          if (nsfwLongPressTimerRef.current) clearTimeout(nsfwLongPressTimerRef.current);
        }}
        onPointerLeave={() => {
          if (nsfwLongPressTimerRef.current) clearTimeout(nsfwLongPressTimerRef.current);
        }}
        onContextMenu={(e) => {
          if (nsfwMode) e.preventDefault();
        }}
        className={`text-[10px] font-medium tracking-[0.25em] uppercase transition-colors duration-200 select-none cursor-default ${nsfwMode ? "text-error" : "text-text-muted"}`}
        title={nsfwMode ? "長押しでNSFWモード解除" : ""}
      >
        RSS
      </button>
      <button
        onClick={onToggleInput}
        disabled={!isOnline}
        className={`w-5 h-5 flex items-center justify-center rounded transition-all duration-200 disabled:opacity-40 ${
          inputOpen
            ? "text-text-default bg-surface-subtle"
            : "text-text-faint hover:text-text-default hover:bg-surface-subtle"
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
      </button>
      <button
        onClick={onRefresh}
        disabled={refreshing || !isOnline}
        className="w-5 h-5 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all duration-200 disabled:opacity-40"
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
  );
}
