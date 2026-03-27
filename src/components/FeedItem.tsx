"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Feed } from "../types";
import FeedFilterModal from "./FeedFilterModal";
import type { KeywordFilter } from "../types";

/** 未読カウントを表示用文字列に変換する（100以上は "99+" と表示） */
export function formatCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

function NsfwIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="5" cy="5" rx="4" ry="2.5" />
      <circle cx="5" cy="5" r="1.5" />
    </svg>
  );
}

function FilterIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 2h8M2.5 5h5M4 8h2" />
    </svg>
  );
}

export interface FeedItemProps {
  feed: Feed;
  count: number;
  isSelected: boolean;
  isPinned: boolean;
  animationIndex: number;
  onSelect: () => void;
  onMarkAllRead: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onFilterSave?: (filter: KeywordFilter | null) => Promise<void>;
  onToggleNsfw?: () => void;
}

interface Action {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  show?: boolean;
  variant?: "danger";
}

export default function FeedItem({
  feed,
  count,
  isSelected,
  isPinned,
  animationIndex,
  onSelect,
  onMarkAllRead,
  onDelete,
  onTogglePin,
  onRename,
  onRetry,
  onFilterSave,
  onToggleNsfw,
}: FeedItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditTitle(feed.title || feed.url);
      setEditing(true);
      setTimeout(() => {
        inputRef.current?.select();
      }, 0);
    },
    [feed.title, feed.url],
  );

  const commitEdit = useCallback(async () => {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === (feed.title || feed.url)) return;
    await onRename(trimmed);
  }, [editTitle, feed.title, feed.url, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commitEdit();
      }
      if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [commitEdit],
  );

  const handleRetry = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (retrying) return;
      setRetrying(true);
      try {
        await onRetry();
      } finally {
        setRetrying(false);
      }
    },
    [onRetry, retrying],
  );

  // ドロップダウン外タップで閉じる（dropdownRef の外側のみ対象）
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const hasFilter =
    feed.filter && (feed.filter.include.length > 0 || feed.filter.exclude.length > 0);

  const actions: Action[] = [
    {
      key: "nsfw",
      label: feed.nsfw ? "NSFW解除" : "NSFW設定",
      icon: <NsfwIcon />,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleNsfw?.();
      },
      show: !!onToggleNsfw,
      className: feed.nsfw
        ? "text-rose-400 hover:text-rose-300"
        : "text-text-faint hover:text-text-default",
    },
    {
      key: "filter",
      label: hasFilter ? "フィルター設定中" : "キーワードフィルター",
      icon: <FilterIcon />,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(false);
        setFilterModalOpen(true);
      },
      show: !!onFilterSave,
      className: hasFilter ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "pin",
      label: isPinned ? "ピン解除" : "ピン留め",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill={isPinned ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 1L6.5 4H9L7 6l.5 3L5 7.5 2.5 9 3 6 1 4h2.5z" />
        </svg>
      ),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onTogglePin();
      },
      className: isPinned ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "read",
      label: "全て既読",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1.5 5l2.5 2.5L8.5 2.5" />
        </svg>
      ),
      onClick: (e) => {
        e.stopPropagation();
        onMarkAllRead();
      },
      show: count > 0,
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "retry",
      label: feed.fetchError ? "再試行" : "更新",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={retrying ? "animate-spin" : ""}
        >
          <path d="M8.5 2A4 4 0 1 0 9 5.5" />
          <polyline points="7,0.5 8.5,2 7,3.5" />
        </svg>
      ),
      onClick: handleRetry,
      disabled: retrying,
      className: feed.fetchError
        ? "text-rose-400 hover:text-rose-300"
        : "text-text-faint hover:text-text-default",
      variant: feed.fetchError ? ("danger" as const) : undefined,
    },
    {
      key: "delete",
      label: "削除",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      ),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
      },
      className: "text-text-faint hover:text-rose-400",
      variant: "danger" as const,
    },
  ];

  const visibleActions = actions.filter((a) => a.show !== false);

  return (
    <div
      onClick={
        editing
          ? undefined
          : () => {
              setMenuOpen(false);
              onSelect();
            }
      }
      onDoubleClick={editing ? undefined : startEdit}
      className={`group relative flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 animate-fade-up ${
        isSelected
          ? "text-text-strong bg-surface-subtle"
          : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
      }`}
      style={{ animationDelay: `${animationIndex * 40}ms` }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => {
            void commitEdit();
          }}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-[13px] bg-surface-base border border-border-default rounded px-1.5 py-0.5 text-text-strong outline-none focus:border-text-muted min-w-0"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <span className="flex items-center gap-1 min-w-0">
            <span
              className="text-[13px] tracking-[0.02em] truncate"
              title="ダブルクリックでタイトルを編集"
            >
              {feed.title || feed.url}
            </span>
            {feed.nsfw && (
              <span title="NSFWフィード" className="flex-shrink-0 text-rose-400">
                <NsfwIcon size={8} />
              </span>
            )}
            {hasFilter && (
              <span title="キーワードフィルター設定中" className="flex-shrink-0 text-text-muted">
                <FilterIcon size={8} />
              </span>
            )}
          </span>
          {feed.fetchError && (
            <span className="text-[10px] text-rose-400 truncate block leading-tight mt-0.5">
              {(feed.consecutiveErrors ?? 0) >= 5 ? "更新停止 · " : ""}
              {feed.fetchError}
            </span>
          )}
        </div>
      )}
      <span className="flex items-center gap-1 ml-1 flex-shrink-0">
        {count > 0 && (
          <span
            className={`text-[11px] ${feed.fetchError ? "text-rose-400" : "text-text-muted"} tabular-nums group-hover:opacity-0 transition-opacity duration-150 ${menuOpen ? "opacity-0" : ""}`}
          >
            {formatCount(count)}
          </span>
        )}

        {/* デスクトップ: ホバーで表示 */}
        <span
          className={`opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 flex items-center gap-0.5 ${menuOpen ? "!opacity-0 !pointer-events-none" : ""}`}
        >
          {visibleActions.map((action) => (
            <button
              key={action.key}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.label}
              className={`p-0.5 transition-colors duration-150 disabled:opacity-40 ${action.className ?? ""}`}
            >
              {action.icon}
            </button>
          ))}
        </span>

        {/* モバイル用 ⋮ ボタン (lg 以上では非表示) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="lg:hidden p-1 -mr-1 text-text-faint transition-colors duration-150"
          title="操作メニュー"
          aria-label="操作メニューを開く"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="2" r="1.2" />
            <circle cx="6" cy="6" r="1.2" />
            <circle cx="6" cy="10" r="1.2" />
          </svg>
        </button>
      </span>

      {/* モバイル用ドロップダウンメニュー */}
      {menuOpen && (
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-full z-20 mt-0.5 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[120px]"
        >
          {visibleActions.map((action) => (
            <button
              key={action.key}
              onClick={(e) => {
                setMenuOpen(false);
                action.onClick(e);
              }}
              disabled={action.disabled}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-subtle transition-colors text-left disabled:opacity-40 ${
                action.variant === "danger" ? "text-rose-400" : "text-text-default"
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
      {filterModalOpen && onFilterSave && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setFilterModalOpen(false)}
          onSave={onFilterSave}
        />
      )}
    </div>
  );
}
