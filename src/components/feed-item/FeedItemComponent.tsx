"use client";

import {
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { useConfirm } from "@/hooks/useConfirm";
import ConfirmModal from "@/components/ConfirmModal";

const FeedFilterModal = dynamic(() => import("../FeedFilterModal"), { ssr: false });
const FeedDetailModal = dynamic(() => import("../FeedDetailModal"), { ssr: false });
import { useEventListener } from "@/hooks/useEventListener";
import { usePopupLock } from "@/hooks/usePopupLock";
import { formatCount } from "@/lib/article-utils";
import type { FeedItemProps } from "./types";
import {
  ContextMenuPortal,
  MuteMenuPortal,
  ViewMenuPortal,
  GroupMenuPortal,
  DigestMenuPortal,
} from "./FeedContextMenu";
import FeedTitleContent from "./FeedTitleContent";
import { buildFeedActions } from "./feedActions";

export { formatCount };

/** Enter/Escape キーに対応したインプット用キーハンドラーを生成する。 */
function makeInputKeyHandler(onEnter: () => void | Promise<void>, onEscape: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void onEnter();
    } else if (e.key === "Escape") {
      onEscape();
    }
  };
}

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30日

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
  onSetDigestLimit,
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
  const [digestOpen, setDigestOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const { confirm, confirmModalProps } = useConfirm();

  usePopupLock(menuOpen || muteOpen || groupOpen || viewOpen || digestOpen);

  useEventListener("scroll", () => setMenuOpen(false), window, true);
  useEventListener("resize", () => setMenuOpen(false));

  const startEdit = useCallback(
    (e: MouseEvent) => {
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

  const actions = buildFeedActions({
    feed,
    count,
    isPinned,
    isMuted,
    hasFilter: !!hasFilter,
    loadingAction,
    groups,
    onTogglePriority,
    onToggleNsfw,
    onFilterSave,
    onSetCategory,
    onSetGroup,
    onSetView,
    onSetDigestLimit,
    onMute,
    onReinfer,
    setMenuOpen,
    setDetailOpen,
    setFilterModalOpen,
    startCategoryEdit,
    setGroupOpen,
    setViewOpen,
    setDigestOpen,
    setMuteOpen,
    onTogglePin,
    onMarkAllRead,
    handleRetry,
    handleReinfer,
    onDelete,
    confirmDelete: () =>
      confirm({
        title: "フィードの削除",
        message: `「${feed.title}」を削除しますか？`,
        confirmLabel: "削除",
        danger: true,
      }),
  });

  const visibleActions = actions.filter((a) => a.show !== false);

  const menuBtnRect = menuButtonRef.current?.getBoundingClientRect();

  const menuPortalStyle: CSSProperties = (() => {
    const MIN_MENU_WIDTH = 180;
    const estimatedMenuHeight = visibleActions.length * 34;

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
      role="option"
      aria-selected={isSelected}
      aria-label={feed.title || feed.url}
      tabIndex={isSelected ? 0 : -1}
      onClick={
        editing || categoryEditing
          ? undefined
          : () => {
              setMenuOpen(false);
              onSelect();
            }
      }
      onKeyDown={
        editing || categoryEditing
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setMenuOpen(false);
                onSelect();
              }
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
        <FeedTitleContent
          feed={feed}
          isSelected={isSelected}
          isStale={isStale}
          isMuted={isMuted}
          hasFilter={hasFilter}
        />
      )}
      <span className="flex items-center gap-1 ml-1 flex-shrink-0">
        {count > 0 && (
          <span
            className={`text-[11px] ${feed.fetchError ? "text-error" : "text-text-muted"} tabular-nums group-hover:opacity-0 transition-opacity duration-150 ${menuOpen ? "opacity-0" : ""}`}
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
          className={`p-1 -mr-1 max-md:min-w-[44px] max-md:min-h-[44px] max-md:flex max-md:items-center max-md:justify-center text-text-faint hover:text-text-default transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${menuOpen ? "!opacity-100" : ""}`}
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

      {menuOpen && (
        <ContextMenuPortal
          visibleActions={visibleActions}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setMenuOpen(false)}
          btnRef={menuButtonRef}
        />
      )}
      {filterModalOpen && onFilterSave && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setFilterModalOpen(false)}
          onSave={onFilterSave}
        />
      )}
      {detailOpen && <FeedDetailModal feed={feed} onClose={() => setDetailOpen(false)} />}
      <ConfirmModal {...confirmModalProps} />
      {muteOpen && onMute && (
        <MuteMenuPortal
          menuPortalStyle={menuPortalStyle}
          onClose={() => setMuteOpen(false)}
          onMute={onMute}
        />
      )}
      {viewOpen && onSetView && (
        <ViewMenuPortal
          feed={feed}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setViewOpen(false)}
          onSetView={onSetView}
        />
      )}
      {digestOpen && onSetDigestLimit && (
        <DigestMenuPortal
          feed={feed}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setDigestOpen(false)}
          onSetDigestLimit={onSetDigestLimit}
        />
      )}
      {groupOpen && onSetGroup && (
        <GroupMenuPortal
          feed={feed}
          groups={groups ?? []}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setGroupOpen(false)}
          onSetGroup={onSetGroup}
        />
      )}
    </div>
  );
}
