"use client";

import { type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Feed, FeedGroup, FeedView } from "../../types";
import type { Action } from "./types";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";

const MUTE_OPTIONS = [
  { label: "1時間", durationMs: 60 * 60 * 1000 },
  { label: "8時間", durationMs: 8 * 60 * 60 * 1000 },
  { label: "1日", durationMs: 24 * 60 * 60 * 1000 },
  { label: "1週間", durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

interface ContextMenuProps {
  visibleActions: Action[];
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  btnRef: RefObject<HTMLButtonElement | null>;
}
export function ContextMenuPortal({
  visibleActions,
  menuPortalStyle,
  onClose,
  btnRef,
}: ContextMenuProps) {
  // #864 案 A: useMenuKeyboard が Escape / Tab / Arrow を統合提供する。
  // 旧来の manual `document.addEventListener("keydown", ..., Escape close)` は重複のため削除。
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, (_v: boolean) => onClose(), btnRef);

  return createPortal(
    <>
      {/* backdrop: タップ貫通防止 */}
      <div
        className="fixed inset-0 z-[49]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="フィード操作メニュー"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[120px]"
        style={menuPortalStyle}
      >
        {visibleActions.map((action) => (
          <button
            key={action.key}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              action.onClick();
            }}
            disabled={action.disabled}
            aria-busy={action.disabled}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-subtle transition-colors text-left disabled:opacity-40 ${
              action.variant === "danger" ? "text-error" : "text-text-default"
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

interface MuteMenuProps {
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onMute: (mutedUntil: string | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
}

export function MuteMenuPortal({ menuPortalStyle, onClose, onMute, btnRef }: MuteMenuProps) {
  // #864 案 A: ContextMenuPortal と同 pattern。useMenuKeyboard で Escape / Tab / Arrow を統合。
  // Escape close 時に trigger (⋮) button へ focus 復元するため btnRef を渡す (#1068, WCAG 2.4.3)。
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, (_v: boolean) => onClose(), btnRef);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[49]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="menu"
        aria-label="ミュート期間"
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
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
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
  );
}

interface ViewMenuProps {
  feed: Feed;
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onSetView: (view: FeedView | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
}

export function ViewMenuPortal({
  feed,
  menuPortalStyle,
  onClose,
  onSetView,
  btnRef,
}: ViewMenuProps) {
  // #864 案 A: useMenuKeyboard 統合 (Mute/Digest/Group portal と同 pattern)。
  // Escape close 時に trigger (⋮) button へ focus 復元するため btnRef を渡す (#1068, WCAG 2.4.3)。
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, (_v: boolean) => onClose(), btnRef);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[49]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="menu"
        aria-label="表示カテゴリ"
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
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
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
  );
}

const DIGEST_OPTIONS = [
  { label: "デフォルト (3件)", value: null },
  { label: "1件", value: 1 },
  { label: "3件", value: 3 },
  { label: "5件", value: 5 },
  { label: "10件", value: 10 },
  { label: "全件", value: 0 },
] as const;

interface DigestMenuProps {
  feed: Feed;
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onSetDigestLimit: (limit: number | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
}

export function DigestMenuPortal({
  feed,
  menuPortalStyle,
  onClose,
  onSetDigestLimit,
  btnRef,
}: DigestMenuProps) {
  // #864 案 A: useMenuKeyboard 統合 (Mute/View/Group portal と同 pattern)。
  // Escape close 時に trigger (⋮) button へ focus 復元するため btnRef を渡す (#1068, WCAG 2.4.3)。
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, (_v: boolean) => onClose(), btnRef);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[49]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="ダイジェスト件数"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px]"
        style={menuPortalStyle}
      >
        <div className="px-3 pt-2 pb-1">
          <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
            ダイジェスト件数
          </p>
        </div>
        <div className="border-t border-border-subtle">
          {DIGEST_OPTIONS.map((opt) => {
            const current =
              opt.value === null ? feed.digestLimit === undefined : feed.digestLimit === opt.value;
            return (
              <button
                key={String(opt.value)}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  if (!current) void onSetDigestLimit(opt.value);
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
  );
}

interface GroupMenuProps {
  feed: Feed;
  groups: FeedGroup[];
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onSetGroup: (groupId: string | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
}

export function GroupMenuPortal({
  feed,
  groups,
  menuPortalStyle,
  onClose,
  onSetGroup,
  btnRef,
}: GroupMenuProps) {
  // #864 案 A: useMenuKeyboard 統合 (Mute/View/Digest portal と同 pattern)。
  // Escape close 時に trigger (⋮) button へ focus 復元するため btnRef を渡す (#1068, WCAG 2.4.3)。
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, (_v: boolean) => onClose(), btnRef);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[49]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="グループに移動"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
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
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
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
          {groups.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-faint">
              サイドバーで先にグループを作成してください
            </div>
          ) : (
            groups.map((g) => {
              const isCurrent = feed.groupId === g.id;
              return (
                <button
                  key={g.id}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
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
  );
}
