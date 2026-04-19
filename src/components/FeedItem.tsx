"use client";

import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Feed, FeedGroup, FeedView } from "../types";
import FeedFilterModal from "./FeedFilterModal";
import FeedDetailModal from "./FeedDetailModal";
import type { KeywordFilter } from "../types";
import { useEventListener } from "@/hooks/useEventListener";
import { usePopupLock } from "@/hooks/usePopupLock";

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

function StarIcon({ size = 10, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 1l1.2 2.4L9 3.8 7 5.7l.5 2.8L5 7.2 2.5 8.5 3 5.7 1 3.8l2.8-.4z" />
    </svg>
  );
}

/** Enter/Escape キーに対応したインプット用キーハンドラーを生成する。 */
function makeInputKeyHandler(onEnter: () => void | Promise<void>, onEscape: () => void) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void onEnter();
    } else if (e.key === "Escape") {
      onEscape();
    }
  };
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
  lastPublishedAt?: string;
  onSelect: () => void;
  onMarkAllRead: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onReinfer?: () => Promise<void>;
  onFilterSave?: (filter: KeywordFilter | null) => Promise<void>;
  onToggleNsfw?: () => void;
  onTogglePriority?: () => void;
  onSetCategory?: (category: string | null) => Promise<void>;
  groups?: FeedGroup[];
  onSetGroup?: (groupId: string | null) => Promise<void>;
  onMute?: (mutedUntil: string | null) => Promise<void>;
  onSetView?: (view: FeedView | null) => Promise<void>;
  onDragStartFeed?: (feedId: string) => void;
  onDragEndFeed?: () => void;
  isDragging?: boolean;
}

interface Action {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  show?: boolean;
  variant?: "danger";
}

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30日

const MUTE_OPTIONS = [
  { label: "1時間", durationMs: 60 * 60 * 1000 },
  { label: "8時間", durationMs: 8 * 60 * 60 * 1000 },
  { label: "1日", durationMs: 24 * 60 * 60 * 1000 },
  { label: "1週間", durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

export default function FeedItem({
  feed,
  count,
  isSelected,
  isPinned,
  animationIndex,
  lastPublishedAt,
  onSelect,
  onMarkAllRead,
  onDelete,
  onTogglePin,
  onRename,
  onRetry,
  onReinfer,
  onFilterSave,
  onToggleNsfw,
  onTogglePriority,
  onSetCategory,
  groups,
  onSetGroup,
  onMute,
  onSetView,
  onDragStartFeed,
  onDragEndFeed,
  isDragging,
}: FeedItemProps) {
  const isStale =
    !feed.fetchError &&
    lastPublishedAt !== undefined &&
    Date.now() - new Date(lastPublishedAt).getTime() > STALE_THRESHOLD_MS;
  const isMuted = !!(feed.mutedUntil && feed.mutedUntil > new Date().toISOString());
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [categoryEditing, setCategoryEditing] = useState(false);
  const [editCategory, setEditCategory] = useState("");
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const [loadingAction, setLoadingAction] = useState<"retry" | "reinfer" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // 右クリック由来のときはカーソル座標、⋮ ボタン由来のときは null。
  // null のときは menuButtonRef ベースで位置を決める。
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // ドロップダウン系メニューが開いている間はポップアップロックを立てる
  // （FilterModal / DetailModal は内部の Modal 基盤側でロック取得済み）
  usePopupLock(menuOpen || muteOpen || groupOpen || viewOpen);

  useEventListener("scroll", () => setMenuOpen(false), window, true);
  useEventListener("resize", () => setMenuOpen(false));

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

  const handleKeyDown = makeInputKeyHandler(commitEdit, () => setEditing(false));

  const handleRetry = useCallback(async () => {
    if (loadingAction) return;
    setLoadingAction("retry");
    try {
      await onRetry();
    } finally {
      setLoadingAction(null);
    }
  }, [onRetry, loadingAction]);

  const handleReinfer = useCallback(async () => {
    if (loadingAction || !onReinfer) return;
    setLoadingAction("reinfer");
    setMenuOpen(false);
    try {
      await onReinfer();
    } finally {
      setLoadingAction(null);
    }
  }, [onReinfer, loadingAction]);

  const startCategoryEdit = useCallback(() => {
    setEditCategory(feed.category ?? "");
    setCategoryEditing(true);
    setTimeout(() => categoryInputRef.current?.select(), 0);
  }, [feed.category]);

  const commitCategoryEdit = useCallback(async () => {
    setCategoryEditing(false);
    const trimmed = editCategory.trim();
    const newCategory = trimmed === "" ? null : trimmed;
    if (newCategory === (feed.category ?? null)) return;
    await onSetCategory?.(newCategory);
  }, [editCategory, feed.category, onSetCategory]);

  const handleCategoryKeyDown = makeInputKeyHandler(commitCategoryEdit, () =>
    setCategoryEditing(false),
  );

  const hasFilter =
    feed.filter && (feed.filter.include.length > 0 || feed.filter.exclude.length > 0);

  const actions: Action[] = [
    {
      key: "detail",
      label: "詳細を見る",
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
          <circle cx="5" cy="5" r="4" />
          <line x1="5" y1="4" x2="5" y2="7" />
          <circle cx="5" cy="2.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      ),
      onClick: () => setDetailOpen(true),
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "priority",
      label: feed.priority === "high" ? "スター解除" : "スター付き",
      icon: <StarIcon filled={feed.priority === "high"} />,
      onClick: () => onTogglePriority?.(),
      show: !!onTogglePriority,
      className:
        feed.priority === "high"
          ? "text-amber-400 hover:text-amber-300"
          : "text-text-faint hover:text-text-default",
    },
    {
      key: "nsfw",
      label: feed.nsfw ? "NSFW解除" : "NSFW設定",
      icon: <NsfwIcon />,
      onClick: () => onToggleNsfw?.(),
      show: !!onToggleNsfw,
      className: feed.nsfw
        ? "text-rose-400 hover:text-rose-300"
        : "text-text-faint hover:text-text-default",
    },
    {
      key: "filter",
      label: hasFilter ? "フィルター設定中" : "キーワードフィルター",
      icon: <FilterIcon />,
      onClick: () => setFilterModalOpen(true),
      show: !!onFilterSave,
      className: hasFilter ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "category",
      label: feed.category ? `カテゴリ: ${feed.category}` : "カテゴリを設定",
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
          <path d="M1 2.5h4l1 1.5-1 1.5H1z" />
          <line x1="6" y1="4" x2="9" y2="4" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        startCategoryEdit();
      },
      show: !!onSetCategory,
      className: feed.category ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "group",
      label: (() => {
        const current = groups?.find((g) => g.id === feed.groupId);
        return current ? `グループ: ${current.name}` : "グループに移動";
      })(),
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
          <rect x="1" y="2" width="8" height="6" rx="1" />
          <line x1="1" y1="4" x2="9" y2="4" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        setGroupOpen(true);
      },
      show: !!onSetGroup,
      className: feed.groupId ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "view",
      label: (() => {
        const labelMap: Record<FeedView, string> = {
          articles: "記事",
          pictures: "画像",
          videos: "動画",
          social: "SNS",
        };
        const v = feed.view ?? "articles";
        return `表示: ${labelMap[v]}`;
      })(),
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
          <rect x="1" y="1.5" width="8" height="7" rx="1" />
          <line x1="1" y1="4" x2="9" y2="4" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        setViewOpen(true);
      },
      show: !!onSetView,
      className: feed.view ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "mute",
      label: isMuted ? "ミュート解除" : "ミュート",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isMuted ? (
            <>
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          ) : (
            <>
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M23 9l-6 6M17 9l6 6" opacity="0" />
              <line x1="1" y1="1" x2="23" y2="23" opacity="0" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </>
          )}
        </svg>
      ),
      onClick: () => {
        if (isMuted) {
          void onMute?.(null);
        } else {
          setMenuOpen(false);
          setMuteOpen(true);
        }
      },
      show: !!onMute,
      className: isMuted
        ? "text-amber-500 hover:text-amber-400"
        : "text-text-faint hover:text-text-default",
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
      onClick: () => onTogglePin(),
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
      onClick: () => onMarkAllRead(),
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
          className={loadingAction === "retry" ? "animate-spin" : ""}
        >
          <path d="M8.5 2A4 4 0 1 0 9 5.5" />
          <polyline points="7,0.5 8.5,2 7,3.5" />
        </svg>
      ),
      onClick: handleRetry,
      disabled: loadingAction === "retry",
      className: feed.fetchError
        ? "text-rose-400 hover:text-rose-300"
        : "text-text-faint hover:text-text-default",
      variant: feed.fetchError ? ("danger" as const) : undefined,
    },
    {
      key: "reinfer",
      label: loadingAction === "reinfer" ? "推論中..." : "セレクタを再推論",
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
          className={loadingAction === "reinfer" ? "animate-spin" : ""}
        >
          <path d="M5 1a4 4 0 0 1 4 4" />
          <path d="M9 5a4 4 0 0 1-4 4" />
          <path d="M5 9a4 4 0 0 1-4-4" />
          <path d="M1 5a4 4 0 0 1 4-4" />
        </svg>
      ),
      onClick: () => void handleReinfer(),
      disabled: loadingAction === "reinfer",
      show: feed.isScraping && !!onReinfer,
      className: "text-text-faint hover:text-text-default",
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
      onClick: () => onDelete(),
      className: "text-text-faint hover:text-rose-400",
      variant: "danger" as const,
    },
  ];

  const visibleActions = actions.filter((a) => a.show !== false);

  const menuBtnRect = menuButtonRef.current?.getBoundingClientRect();

  const menuPortalStyle: React.CSSProperties = (() => {
    const MIN_MENU_WIDTH = 180;
    const estimatedMenuHeight = visibleActions.length * 34;

    // 右クリック由来: マウス座標に展開（画面端ではみ出さないようクランプ）
    if (menuAnchor) {
      const left = Math.min(menuAnchor.x, window.innerWidth - MIN_MENU_WIDTH - 4);
      const spaceBelow = window.innerHeight - menuAnchor.y;
      if (spaceBelow >= estimatedMenuHeight) {
        return { top: menuAnchor.y, left: Math.max(4, left) };
      }
      return {
        bottom: window.innerHeight - menuAnchor.y,
        left: Math.max(4, left),
      };
    }

    // ⋮ ボタン由来: ボタン右端に揃える（従来挙動）
    if (!menuBtnRect) return { top: 0, right: 0 };
    const rightPos = Math.min(
      Math.max(0, window.innerWidth - menuBtnRect.right),
      window.innerWidth - MIN_MENU_WIDTH,
    );
    const spaceBelow = window.innerHeight - menuBtnRect.bottom;
    if (spaceBelow >= estimatedMenuHeight) {
      return { top: menuBtnRect.bottom + 2, right: rightPos };
    }
    return { bottom: window.innerHeight - menuBtnRect.top + 2, right: rightPos };
  })();

  const canDrag = !editing && !categoryEditing && !!onDragStartFeed;
  return (
    <div
      onClick={
        editing || categoryEditing
          ? undefined
          : () => {
              setMenuOpen(false);
              onSelect();
            }
      }
      onDoubleClick={editing || categoryEditing ? undefined : startEdit}
      draggable={canDrag}
      onDragStart={
        canDrag
          ? (e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("application/x-rss-feed-id", feed.id);
              onDragStartFeed?.(feed.id);
            }
          : undefined
      }
      onDragEnd={canDrag ? () => onDragEndFeed?.() : undefined}
      onContextMenu={
        editing || categoryEditing
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              setMuteOpen(false);
              setGroupOpen(false);
              setMenuAnchor({ x: e.clientX, y: e.clientY });
              setMenuOpen(true);
            }
      }
      className={`group relative flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 ${
        isSelected
          ? "text-text-strong bg-surface-subtle"
          : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
      } ${isDragging ? "opacity-40" : ""}`}
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
      ) : categoryEditing ? (
        <input
          ref={categoryInputRef}
          type="text"
          value={editCategory}
          placeholder="カテゴリ名（空で解除）"
          onChange={(e) => setEditCategory(e.target.value)}
          onBlur={() => {
            void commitCategoryEdit();
          }}
          onKeyDown={handleCategoryKeyDown}
          onClick={(e) => e.stopPropagation()}
          maxLength={50}
          className="flex-1 text-[12px] bg-surface-base border border-border-default rounded px-1.5 py-0.5 text-text-strong outline-none focus:border-text-muted min-w-0 placeholder-text-faint"
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
            {feed.priority === "high" && (
              <span title="スター付きフィード" className="flex-shrink-0 text-amber-400">
                <StarIcon size={8} filled />
              </span>
            )}
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
            {isMuted && (
              <span title="ミュート中" className="flex-shrink-0 text-amber-500">
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </span>
            )}
            {isStale && (
              <span title="30日以上新着なし" className="flex-shrink-0 text-text-faint">
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="5" cy="5" r="4" />
                  <polyline points="5,2.5 5,5 6.5,6.5" />
                </svg>
              </span>
            )}
          </span>
          {isSelected && !feed.fetchError && (
            <span className="text-[10px] text-text-faint truncate block leading-tight mt-0.5">
              {feed.url}
            </span>
          )}
          {isSelected && feed.cssSelector && (
            <span
              className="text-[10px] text-text-faint truncate block leading-tight"
              title={`CSS セレクタ: ${feed.cssSelector}`}
            >
              selector: {feed.cssSelector}
            </span>
          )}
          {isSelected && feed.failedSelectors && feed.failedSelectors.length > 0 && (
            <span
              className="text-[10px] text-text-faint truncate block leading-tight"
              title={`失敗済み: ${feed.failedSelectors.join(", ")}`}
            >
              failed: {feed.failedSelectors.join(", ")}
            </span>
          )}
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

        {/* ⋮ ボタン: ホバーで表示（右クリックでも開ける） */}
        <button
          ref={menuButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(null);
            setMenuOpen((v) => !v);
          }}
          className={`p-1 -mr-1 text-text-faint hover:text-text-default transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${menuOpen ? "!opacity-100" : ""}`}
          title="操作メニュー（右クリックでも開けます）"
          aria-label="操作メニューを開く"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="2" r="1.2" />
            <circle cx="6" cy="6" r="1.2" />
            <circle cx="6" cy="10" r="1.2" />
          </svg>
        </button>
      </span>

      {/* モバイル用ドロップダウンメニュー (Portal で body 直下にレンダリング) */}
      {menuOpen &&
        createPortal(
          <>
            {/* backdrop: タップ貫通防止 */}
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[120px]"
              style={menuPortalStyle}
            >
              {visibleActions.map((action) => (
                <button
                  key={action.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    action.onClick();
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
          </>,
          document.body,
        )}
      {filterModalOpen && onFilterSave && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setFilterModalOpen(false)}
          onSave={onFilterSave}
        />
      )}
      {detailOpen && <FeedDetailModal feed={feed} onClose={() => setDetailOpen(false)} />}
      {muteOpen &&
        onMute &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={(e) => {
                e.stopPropagation();
                setMuteOpen(false);
              }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[160px]"
              style={menuPortalStyle}
            >
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                  ミュート期間
                </p>
              </div>
              <div className="border-t border-border-subtle">
                {MUTE_OPTIONS.map((opt) => (
                  <button
                    key={opt.durationMs}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMuteOpen(false);
                      const until = new Date(Date.now() + opt.durationMs).toISOString();
                      void onMute(until);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-shrink-0"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
      {viewOpen &&
        onSetView &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={(e) => {
                e.stopPropagation();
                setViewOpen(false);
              }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px]"
              style={menuPortalStyle}
            >
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                  表示カテゴリ
                </p>
              </div>
              <div className="border-t border-border-subtle">
                {(
                  [
                    { id: "articles" as const, label: "記事" },
                    { id: "pictures" as const, label: "画像" },
                    { id: "videos" as const, label: "動画" },
                    { id: "social" as const, label: "SNS" },
                  ] as const
                ).map((opt) => {
                  const current = (feed.view ?? "articles") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewOpen(false);
                        if (!current) void onSetView(opt.id);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-subtle transition-colors text-left ${current ? "text-text-strong bg-surface-subtle" : "text-text-default"}`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${current ? "bg-accent-dot" : "bg-transparent border border-text-faint"}`}
                      />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
      {groupOpen &&
        onSetGroup &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={(e) => {
                e.stopPropagation();
                setGroupOpen(false);
              }}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px] max-h-[60vh] overflow-y-auto"
              style={menuPortalStyle}
            >
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                  グループに移動
                </p>
              </div>
              <div className="border-t border-border-subtle">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroupOpen(false);
                    void onSetGroup(null);
                  }}
                  disabled={!feed.groupId}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left disabled:opacity-40"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <line x1="1" y1="1" x2="9" y2="9" />
                    <line x1="9" y1="1" x2="1" y2="9" />
                  </svg>
                  グループなし
                </button>
                {(groups ?? []).length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-text-faint">
                    サイドバーで先にグループを作成してください
                  </div>
                ) : (
                  (groups ?? []).map((g) => {
                    const isCurrent = feed.groupId === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGroupOpen(false);
                          if (!isCurrent) void onSetGroup(g.id);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-subtle transition-colors text-left ${isCurrent ? "text-text-strong bg-surface-subtle" : "text-text-default"}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${isCurrent ? "bg-accent-dot" : "bg-transparent border border-text-faint"}`}
                        />
                        <span className="truncate">{g.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
