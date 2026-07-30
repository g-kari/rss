"use client";

import {
  memo,
  useId,
  useRef,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { FeedView, KeywordFilter } from "../../types";
import dynamic from "next/dynamic";
import { useConfirm } from "@/hooks/useConfirm";
import ConfirmModal from "@/components/ConfirmModal";

const FeedFilterModal = dynamic(() => import("../FeedFilterModal"), { ssr: false });
const FeedDetailModal = dynamic(() => import("../FeedDetailModal"), { ssr: false });
import { useEventListener } from "@/hooks/useEventListener";
import { usePopupLock } from "@/hooks/usePopupLock";
import { formatCount } from "@/lib/article-utils";
import { computeContextMenuPosition } from "@/lib/context-menu-position";
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

function FeedItem({
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
  const isMuted = useMemo(
    () => !!(feed.mutedUntil && feed.mutedUntil > new Date().toISOString()),
    [feed.mutedUntil],
  );
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
  // #1194: disclosure 3 点セット (aria-expanded / aria-controls / menu id)。
  // ⋮ button から開く 5 portal はいずれも同 button がトリガーのため menuId を共有する。
  const menuId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const { confirm, confirmModalProps } = useConfirm();

  // #1076: parent の stable callback に feed / feed.id を bind する wrapper。
  // これらは FeedItem の子 (buildFeedActions / portals / modals) でのみ使われ、子は FeedItem
  // 再 render 時にのみ再 render されるため plain const で十分 (FeedItem 自身の memo は props で判定)。
  const handleSelect = () => onSelect(feed.id);
  const handleMarkAllRead = () => onMarkAllRead(feed.id);
  const handleDelete = () => onDelete(feed.id);
  const handleTogglePin = () => onTogglePin(feed.id);
  const handleToggleNsfw = onToggleNsfw ? () => onToggleNsfw(feed) : undefined;
  const handleTogglePriority = onTogglePriority ? () => onTogglePriority(feed) : undefined;
  const handleSetCategory = onSetCategory
    ? (category: string | null) => onSetCategory(feed, category)
    : undefined;
  const handleSetGroup = onSetGroup
    ? (groupId: string | null) => onSetGroup(feed, groupId)
    : undefined;
  const handleMute = onMute ? (mutedUntil: string | null) => onMute(feed, mutedUntil) : undefined;
  const handleSetView = onSetView ? (view: FeedView | null) => onSetView(feed, view) : undefined;
  const handleSetDigestLimit = onSetDigestLimit
    ? (limit: number | null) => onSetDigestLimit(feed, limit)
    : undefined;
  const handleFilterSave = onFilterSave
    ? (filter: KeywordFilter | null) => onFilterSave(feed.id, filter)
    : undefined;

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
    await onRename(feed.id, trimmed);
  }, [editTitle, feed.id, feed.title, feed.url, onRename]);

  const handleKeyDown = makeInputKeyHandler(commitEdit, () => setEditing(false));

  const handleRetry = useCallback(async () => {
    if (loadingAction) return;
    setLoadingAction("retry");
    try {
      await onRetry(feed.id);
    } finally {
      setLoadingAction(null);
    }
  }, [onRetry, feed.id, loadingAction]);

  const handleReinfer = useCallback(async () => {
    if (loadingAction || !onReinfer) return;
    setLoadingAction("reinfer");
    setMenuOpen(false);
    try {
      await onReinfer(feed.id);
    } finally {
      setLoadingAction(null);
    }
  }, [onReinfer, feed.id, loadingAction]);

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
    await onSetCategory?.(feed, newCategory);
  }, [editCategory, feed, onSetCategory]);

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
    onTogglePriority: handleTogglePriority,
    onToggleNsfw: handleToggleNsfw,
    onFilterSave: handleFilterSave,
    onSetCategory: handleSetCategory,
    onSetGroup: handleSetGroup,
    onSetView: handleSetView,
    onSetDigestLimit: handleSetDigestLimit,
    onMute: handleMute,
    onReinfer: onReinfer ? handleReinfer : undefined,
    setMenuOpen,
    setDetailOpen,
    setFilterModalOpen,
    startCategoryEdit,
    setGroupOpen,
    setViewOpen,
    setDigestOpen,
    setMuteOpen,
    onTogglePin: handleTogglePin,
    onMarkAllRead: handleMarkAllRead,
    handleRetry,
    handleReinfer,
    onDelete: handleDelete,
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
      return computeContextMenuPosition(
        menuAnchor.x,
        menuAnchor.y,
        MIN_MENU_WIDTH,
        estimatedMenuHeight,
      );
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
      // #1197: click / Enter / Space で feed を選択する interactive 要素だが、
      // draggable と内側 button 群の都合で native <button> にできないため role で補う
      // (sibling canonical: FeedGroupsSection / TagsSection は native <button>)。
      role="button"
      aria-current={isSelected ? "true" : undefined}
      aria-label={feed.title || feed.url}
      tabIndex={isSelected ? 0 : -1}
      onClick={
        editing || categoryEditing
          ? undefined
          : () => {
              setMenuOpen(false);
              handleSelect();
            }
      }
      onKeyDown={
        editing || categoryEditing
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setMenuOpen(false);
                handleSelect();
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
          aria-label="フィード名を編集"
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
          aria-label="カテゴリ名を編集"
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
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={
            menuOpen || muteOpen || viewOpen || digestOpen || groupOpen ? menuId : undefined
          }
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
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
          menuId={menuId}
        />
      )}
      {filterModalOpen && handleFilterSave && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setFilterModalOpen(false)}
          onSave={handleFilterSave}
        />
      )}
      {detailOpen && <FeedDetailModal feed={feed} onClose={() => setDetailOpen(false)} />}
      <ConfirmModal {...confirmModalProps} />
      {muteOpen && handleMute && (
        <MuteMenuPortal
          menuPortalStyle={menuPortalStyle}
          onClose={() => setMuteOpen(false)}
          onMute={handleMute}
          btnRef={menuButtonRef}
          menuId={menuId}
        />
      )}
      {viewOpen && handleSetView && (
        <ViewMenuPortal
          feed={feed}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setViewOpen(false)}
          onSetView={handleSetView}
          btnRef={menuButtonRef}
          menuId={menuId}
        />
      )}
      {digestOpen && handleSetDigestLimit && (
        <DigestMenuPortal
          feed={feed}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setDigestOpen(false)}
          onSetDigestLimit={handleSetDigestLimit}
          btnRef={menuButtonRef}
          menuId={menuId}
        />
      )}
      {groupOpen && handleSetGroup && (
        <GroupMenuPortal
          feed={feed}
          groups={groups ?? []}
          menuPortalStyle={menuPortalStyle}
          onClose={() => setGroupOpen(false)}
          onSetGroup={handleSetGroup}
          btnRef={menuButtonRef}
          menuId={menuId}
        />
      )}
    </div>
  );
}

// #1076: memo() で wrap して、無関係 prop 変化 (検索キーストローク / selectedFeedId / polling) 由来の
// 親 re-render 時に props 不変な FeedItem の再 render を skip する。renderFeed が stable callback を
// 直渡しする (index.tsx) ことで shallow-equal が機能する (sibling FeedGroupsSection / CategorySection 同様)。
export default memo(FeedItem);
