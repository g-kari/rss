"use client";

import { memo, useRef, useState, type ReactNode } from "react";
import type { FeedGroup, Feed } from "../../types";
import { useConfirm } from "@/hooks/useConfirm";
import ConfirmModal from "@/components/ConfirmModal";
import { formatCount } from "../FeedItem";

function FeedGroupsSectionImpl({
  groups,
  unreadByFeed,
  renderFeed,
  selectedGroupId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onToggleCollapse,
  onToggleMute,
  onReorder,
  onMarkAllRead,
  draggedFeedId,
  dragOverGroupId,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
}: {
  groups: { group: FeedGroup; feeds: Feed[] }[];
  unreadByFeed: Map<string, number>;
  renderFeed: (feed: Feed, startIdx: number) => ReactNode;
  selectedGroupId?: string | null;
  onSelect?: (id: string | null) => void;
  onCreate?: (name: string) => Promise<FeedGroup | { error: string }>;
  onRename?: (id: string, name: string) => Promise<FeedGroup | { error: string }>;
  onDelete?: (id: string) => Promise<boolean>;
  onToggleCollapse?: (id: string, collapsed: boolean) => Promise<void>;
  onToggleMute?: (id: string, muted: boolean) => Promise<void>;
  onReorder?: (id: string, direction: "up" | "down") => Promise<void>;
  onMarkAllRead?: (feedIds: string[]) => void;
  draggedFeedId?: string | null;
  dragOverGroupId?: string | null;
  onGroupDragOver?: (groupId: string) => void;
  onGroupDragLeave?: (groupId: string) => void;
  onGroupDrop?: (feedId: string, groupId: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmModalProps } = useConfirm();

  async function commitCreate() {
    const name = newName.trim();
    if (!name || !onCreate) {
      setCreating(false);
      setNewName("");
      setCreateError(null);
      return;
    }
    const result = await onCreate(name);
    if ("error" in result) {
      setCreateError(result.error);
      return;
    }
    setCreating(false);
    setNewName("");
    setCreateError(null);
  }

  async function commitRename(id: string) {
    const name = editingName.trim();
    if (!name || !onRename) {
      setEditingId(null);
      setEditError(null);
      return;
    }
    const result = await onRename(id, name);
    if ("error" in result) {
      setEditError(result.error);
      return;
    }
    setEditingId(null);
    setEditError(null);
  }

  async function handleDelete(group: FeedGroup) {
    if (!onDelete) return;
    const ok = await confirm({
      title: "グループの削除",
      message: `グループ「${group.name}」を削除しますか？\n所属フィードはグループ解除されます。`,
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    await onDelete(group.id);
  }

  let offset = 0;
  return (
    <>
      {/* セクションヘッダー + 作成ボタン */}
      <div className="px-4 pt-2.5 pb-0.5 flex items-center gap-1 group">
        <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-text-muted">
          グループ
        </span>
        {onCreate && !creating && (
          <button
            onClick={() => {
              setCreating(true);
              setCreateError(null);
              setTimeout(() => createInputRef.current?.focus(), 0);
            }}
            className="ml-auto w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all"
            title="グループを作成"
            aria-label="グループを作成"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <line x1="4.5" y1="1" x2="4.5" y2="8" strokeLinecap="round" />
              <line x1="1" y1="4.5" x2="8" y2="4.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {creating && (
        <div className="px-4 py-1 flex flex-col gap-1">
          <input
            ref={createInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate();
              else if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
                setCreateError(null);
              }
            }}
            onBlur={() => {
              if (!createError) void commitCreate();
            }}
            placeholder="グループ名"
            maxLength={50}
            className="w-full text-[12px] bg-surface-base border border-border-default rounded px-1.5 py-0.5 text-text-strong outline-none focus:border-text-muted placeholder-text-faint"
          />
          {createError && (
            <span role="alert" className="text-[10px] text-error">
              {createError}
            </span>
          )}
        </div>
      )}

      {groups.map(({ group, feeds }, groupIdx) => {
        const isCollapsed = !!group.collapsed;
        const isMuted = !!group.muted;
        const isSelected = selectedGroupId === group.id;
        const groupUnread = feeds.reduce((sum, f) => sum + (unreadByFeed.get(f.id) ?? 0), 0);
        const startIdx = offset;
        offset += feeds.length;
        const canMoveUp = groupIdx > 0;
        const canMoveDown = groupIdx < groups.length - 1;
        const isDragOver = dragOverGroupId === group.id;
        const canAcceptDrop = !!draggedFeedId;
        return (
          <div
            key={`feed-group-${group.id}`}
            onDragOver={
              canAcceptDrop
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (!isDragOver) onGroupDragOver?.(group.id);
                  }
                : undefined
            }
            onDragLeave={
              canAcceptDrop
                ? (e) => {
                    const related = e.relatedTarget;
                    if (related instanceof Node && e.currentTarget.contains(related)) return;
                    onGroupDragLeave?.(group.id);
                  }
                : undefined
            }
            onDrop={
              canAcceptDrop
                ? (e) => {
                    e.preventDefault();
                    const feedId =
                      e.dataTransfer.getData("application/x-rss-feed-id") || draggedFeedId;
                    if (feedId) onGroupDrop?.(feedId, group.id);
                  }
                : undefined
            }
            className={isDragOver ? "ring-2 ring-inset ring-text-muted rounded-sm" : undefined}
          >
            <div
              className={`w-full px-4 pt-1.5 pb-0.5 flex items-center gap-1 group relative transition-colors ${isSelected ? "bg-surface-subtle" : ""}`}
            >
              <button
                onClick={() => void onToggleCollapse?.(group.id, !isCollapsed)}
                className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-text-default hover:bg-surface-subtle"
                title={isCollapsed ? "展開" : "折りたたむ"}
                aria-label={isCollapsed ? `${group.name} を展開` : `${group.name} を折りたたむ`}
                aria-expanded={!isCollapsed}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  className={`transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`}
                  fill="currentColor"
                >
                  <path d="M5 7L1 3h8L5 7z" />
                </svg>
              </button>
              {editingId === group.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") void commitRename(group.id);
                    else if (e.key === "Escape") {
                      setEditingId(null);
                      setEditError(null);
                    }
                  }}
                  onBlur={() => {
                    if (!editError) void commitRename(group.id);
                  }}
                  maxLength={50}
                  className="flex-1 text-[12px] bg-surface-base border border-border-default rounded px-1 py-0 text-text-strong outline-none focus:border-text-muted min-w-0"
                />
              ) : (
                <button
                  onClick={() => onSelect?.(isSelected ? null : group.id)}
                  className="flex-1 min-w-0 flex items-center gap-1 text-left"
                  title={isSelected ? "選択解除" : `${group.name} の記事のみ表示`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`text-[11px] font-medium tracking-[0.05em] truncate ${
                      isSelected
                        ? "text-text-strong"
                        : isMuted
                          ? "text-text-faint italic"
                          : "text-text-default"
                    }`}
                    title={isMuted ? "ミュート中: このグループの記事は非表示です" : undefined}
                  >
                    {group.name}
                  </span>
                  {isCollapsed && (
                    <span
                      className={`ml-auto text-[10px] tabular-nums ${groupUnread > 0 ? "text-text-muted" : "text-text-faint"}`}
                    >
                      {groupUnread > 0 ? formatCount(groupUnread) : feeds.length}
                    </span>
                  )}
                </button>
              )}
              {editingId !== group.id && onToggleMute && isMuted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void onToggleMute(group.id, false);
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-text-default hover:bg-surface-subtle"
                  title="ミュートを解除"
                  aria-label={`${group.name} のミュートを解除`}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1.5 4.5v3h2L6.5 10V2L3.5 4.5z" />
                    <line x1="8" y1="4" x2="11" y2="8" />
                    <line x1="11" y1="4" x2="8" y2="8" />
                  </svg>
                </button>
              )}
              {editingId !== group.id && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  {onMarkAllRead && groupUnread > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAllRead(feeds.map((f) => f.id));
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle"
                      title="グループ内の記事を既読にする"
                      aria-label={`${group.name} の記事を全て既読にする`}
                    >
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
                        <path d="M1 5.5L4 8l5-6" />
                      </svg>
                    </button>
                  )}
                  {onReorder && canMoveUp && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void onReorder(group.id, "up");
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle"
                      title="上へ移動"
                      aria-label={`${group.name} を上へ移動`}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6l3-3 3 3" />
                      </svg>
                    </button>
                  )}
                  {onReorder && canMoveDown && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void onReorder(group.id, "down");
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle"
                      title="下へ移動"
                      aria-label={`${group.name} を下へ移動`}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 4l3 3 3-3" />
                      </svg>
                    </button>
                  )}
                  {onRename && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(group.id);
                        setEditingName(group.name);
                        setEditError(null);
                        setTimeout(() => editInputRef.current?.select(), 0);
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle"
                      title="名前変更"
                      aria-label={`${group.name} の名前を変更`}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 1.5l1.5 1.5L3 8.5H1.5V7z" />
                      </svg>
                    </button>
                  )}
                  {onToggleMute && !isMuted && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void onToggleMute(group.id, true);
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle"
                      title="グループをミュート（一覧から非表示）"
                      aria-label={`${group.name} をミュート`}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1.5 4.5v3h2L6.5 10V2L3.5 4.5z" />
                        <path d="M9 3.5a3 3 0 010 5" />
                      </svg>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(group);
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-error hover:bg-surface-subtle"
                      title="グループを削除"
                      aria-label={`${group.name} を削除`}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <line x1="1" y1="1" x2="9" y2="9" />
                        <line x1="9" y1="1" x2="1" y2="9" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            {editError && editingId === group.id && (
              <div role="alert" className="px-4 pb-1 text-[10px] text-error">
                {editError}
              </div>
            )}
            {!isCollapsed &&
              feeds.length > 0 &&
              feeds.map((feed, i) => <div key={feed.id}>{renderFeed(feed, startIdx + i)}</div>)}
            {!isCollapsed && feeds.length === 0 && (
              <div className="px-8 py-1 text-[10px] text-text-faint">
                フィードメニューから「グループに移動」で追加できます
              </div>
            )}
          </div>
        );
      })}
      <ConfirmModal {...confirmModalProps} />
    </>
  );
}

/**
 * #758: memo 化で props shallow equal なら re-render skip。
 * `useArticleUnreadStats` の構造的等価性ガードで `unreadByFeed` Map が内容変化なし時に
 * 同 reference を返すため、`readIds` 連打などで親が re-render しても本コンポーネント
 * は skip 可能になる。
 */
const FeedGroupsSection = memo(FeedGroupsSectionImpl);
export default FeedGroupsSection;
