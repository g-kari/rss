"use client";

import { type CSSProperties, type RefObject } from "react";
import type { Feed, FeedGroup, FeedView } from "../../types";
import type { Action } from "./types";
import ContextMenuShell from "./ContextMenuShell";
import { MenuSectionHeader } from "./MenuSectionHeader";
import { MenuRadioOption } from "./MenuRadioOption";

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
  menuId: string;
}
export function ContextMenuPortal({
  visibleActions,
  menuPortalStyle,
  onClose,
  btnRef,
  menuId,
}: ContextMenuProps) {
  return (
    <ContextMenuShell
      btnRef={btnRef}
      menuId={menuId}
      onClose={onClose}
      menuPortalStyle={menuPortalStyle}
      ariaLabel="フィード操作メニュー"
      className="min-w-[120px]"
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
    </ContextMenuShell>
  );
}

interface MuteMenuProps {
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onMute: (mutedUntil: string | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
  menuId: string;
}

export function MuteMenuPortal({
  menuPortalStyle,
  onClose,
  onMute,
  btnRef,
  menuId,
}: MuteMenuProps) {
  return (
    <ContextMenuShell
      btnRef={btnRef}
      menuId={menuId}
      onClose={onClose}
      menuPortalStyle={menuPortalStyle}
      ariaLabel="ミュート期間"
      className="min-w-[160px]"
    >
      <MenuSectionHeader title="ミュート期間" />
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
              aria-hidden="true"
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
    </ContextMenuShell>
  );
}

interface ViewMenuProps {
  feed: Feed;
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onSetView: (view: FeedView | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
  menuId: string;
}

export function ViewMenuPortal({
  feed,
  menuPortalStyle,
  onClose,
  onSetView,
  btnRef,
  menuId,
}: ViewMenuProps) {
  return (
    <ContextMenuShell
      btnRef={btnRef}
      menuId={menuId}
      onClose={onClose}
      menuPortalStyle={menuPortalStyle}
      ariaLabel="表示カテゴリ"
      className="min-w-[180px]"
    >
      <MenuSectionHeader title="表示カテゴリ" />
      <div className="border-t border-border-subtle">
        {(
          [
            { id: "articles" as const, label: "記事" },
            { id: "pictures" as const, label: "画像" },
            { id: "videos" as const, label: "動画" },
            { id: "social" as const, label: "SNS" },
          ] as const
        ).map((opt) => (
          <MenuRadioOption
            key={opt.id}
            checked={(feed.view ?? "articles") === opt.id}
            label={opt.label}
            onSelect={() => void onSetView(opt.id)}
            onClose={onClose}
          />
        ))}
      </div>
    </ContextMenuShell>
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
  menuId: string;
}

export function DigestMenuPortal({
  feed,
  menuPortalStyle,
  onClose,
  onSetDigestLimit,
  btnRef,
  menuId,
}: DigestMenuProps) {
  return (
    <ContextMenuShell
      btnRef={btnRef}
      menuId={menuId}
      onClose={onClose}
      menuPortalStyle={menuPortalStyle}
      ariaLabel="ダイジェスト件数"
      className="min-w-[180px]"
    >
      <MenuSectionHeader title="ダイジェスト件数" />
      <div className="border-t border-border-subtle">
        {DIGEST_OPTIONS.map((opt) => (
          <MenuRadioOption
            key={String(opt.value)}
            checked={
              opt.value === null ? feed.digestLimit === undefined : feed.digestLimit === opt.value
            }
            label={opt.label}
            onSelect={() => void onSetDigestLimit(opt.value)}
            onClose={onClose}
          />
        ))}
      </div>
    </ContextMenuShell>
  );
}

interface GroupMenuProps {
  feed: Feed;
  groups: FeedGroup[];
  menuPortalStyle: CSSProperties;
  onClose: () => void;
  onSetGroup: (groupId: string | null) => Promise<void>;
  btnRef: RefObject<HTMLButtonElement | null>;
  menuId: string;
}

export function GroupMenuPortal({
  feed,
  groups,
  menuPortalStyle,
  onClose,
  onSetGroup,
  btnRef,
  menuId,
}: GroupMenuProps) {
  return (
    <ContextMenuShell
      btnRef={btnRef}
      menuId={menuId}
      onClose={onClose}
      menuPortalStyle={menuPortalStyle}
      ariaLabel="グループに移動"
      className="min-w-[180px] max-h-[60vh] overflow-y-auto"
    >
      <MenuSectionHeader title="グループに移動" />
      <div className="border-t border-border-subtle">
        <button
          role="menuitemradio"
          aria-checked={!feed.groupId}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            void onSetGroup(null);
          }}
          disabled={!feed.groupId}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
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
          groups.map((g) => (
            <MenuRadioOption
              key={g.id}
              checked={feed.groupId === g.id}
              label={g.name}
              onSelect={() => void onSetGroup(g.id)}
              onClose={onClose}
            />
          ))
        )}
      </div>
    </ContextMenuShell>
  );
}
