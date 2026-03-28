"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
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
  onReinfer?: () => Promise<void>;
  onFilterSave?: (filter: KeywordFilter | null) => Promise<void>;
  onToggleNsfw?: () => void;
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
  onReinfer,
  onFilterSave,
  onToggleNsfw,
}: FeedItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [reinfering, setReinfering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

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

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry, retrying]);

  const handleReinfer = useCallback(async () => {
    if (reinfering || !onReinfer) return;
    setReinfering(true);
    setMenuOpen(false);
    try {
      await onReinfer();
    } finally {
      setReinfering(false);
    }
  }, [onReinfer, reinfering]);

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
      key: "reinfer",
      label: reinfering ? "推論中..." : "セレクタを再推論",
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
          className={reinfering ? "animate-spin" : ""}
        >
          <path d="M5 1a4 4 0 0 1 4 4" />
          <path d="M9 5a4 4 0 0 1-4 4" />
          <path d="M5 9a4 4 0 0 1-4-4" />
          <path d="M1 5a4 4 0 0 1 4-4" />
        </svg>
      ),
      onClick: () => void handleReinfer(),
      disabled: reinfering,
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
  const menuPortalStyle = menuBtnRect
    ? { top: menuBtnRect.bottom + 2, right: window.innerWidth - menuBtnRect.right }
    : { top: 0, right: 0 };

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

        {/* デスクトップ: ホバーで表示 */}
        <span
          className={`opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 flex items-center gap-0.5 ${menuOpen ? "!opacity-0 !pointer-events-none" : ""}`}
        >
          {visibleActions.map((action) => (
            <button
              key={action.key}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
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
          ref={menuButtonRef}
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
      {detailOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49] bg-black/30"
              onPointerDown={() => setDetailOpen(false)}
            />
            <div
              className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <span className="text-[13px] font-medium text-text-strong">フィード詳細</span>
                <button
                  onClick={() => setDetailOpen(false)}
                  className="text-text-faint hover:text-text-default transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M2 2l10 10M12 2l-10 10" />
                  </svg>
                </button>
              </div>
              {/* コンテンツ */}
              <div className="overflow-y-auto max-h-[70vh] p-4 space-y-4 text-[12px]">
                <DetailSection title="基本情報">
                  <DetailRow label="タイトル" value={feed.title} />
                  <DetailRow label="URL" value={feed.url} copyable />
                  {feed.siteUrl && <DetailRow label="サイト URL" value={feed.siteUrl} copyable />}
                  <DetailRow label="ID" value={feed.id} copyable />
                </DetailSection>

                <DetailSection title="ステータス">
                  <DetailRow
                    label="最終取得"
                    value={
                      feed.lastFetchedAt
                        ? new Date(feed.lastFetchedAt).toLocaleString("ja-JP")
                        : "未取得"
                    }
                  />
                  {feed.pageCount !== undefined && (
                    <DetailRow label="ページ数" value={String(feed.pageCount + 1)} />
                  )}
                  {feed.consecutiveErrors !== undefined && feed.consecutiveErrors > 0 && (
                    <DetailRow label="連続エラー" value={`${feed.consecutiveErrors} 回`} error />
                  )}
                  {feed.fetchError && (
                    <DetailRow label="エラー内容" value={feed.fetchError} error />
                  )}
                  {feed.lastErrorAt && (
                    <DetailRow
                      label="最終エラー日時"
                      value={new Date(feed.lastErrorAt).toLocaleString("ja-JP")}
                      error
                    />
                  )}
                  {feed.rateLimitedUntil && (
                    <DetailRow
                      label="レート制限解除"
                      value={new Date(feed.rateLimitedUntil).toLocaleString("ja-JP")}
                      error
                    />
                  )}
                  <DetailRow label="NSFW" value={feed.nsfw ? "有効" : "無効"} />
                </DetailSection>

                {feed.isScraping && (
                  <DetailSection title="スクレイピング設定">
                    <DetailRow label="モード" value="LLM セレクタ推論" />
                    {feed.cssSelector && (
                      <DetailRow label="現在のセレクタ" value={feed.cssSelector} copyable mono />
                    )}
                    {feed.failedSelectors && feed.failedSelectors.length > 0 && (
                      <DetailRow
                        label="失敗済みセレクタ"
                        value={feed.failedSelectors.join(", ")}
                        mono
                      />
                    )}
                  </DetailSection>
                )}

                {feed.filter &&
                  (feed.filter.include.length > 0 || feed.filter.exclude.length > 0) && (
                    <DetailSection title="キーワードフィルター">
                      {feed.filter.include.length > 0 && (
                        <DetailRow label="含む" value={feed.filter.include.join(", ")} />
                      )}
                      {feed.filter.exclude.length > 0 && (
                        <DetailRow label="除外" value={feed.filter.exclude.join(", ")} />
                      )}
                      <DetailRow
                        label="カテゴリも対象"
                        value={feed.filter.matchCategories ? "はい" : "いいえ"}
                      />
                    </DetailSection>
                  )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-text-muted mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyable,
  mono,
  error,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
  error?: boolean;
}) {
  function handleCopy() {
    void navigator.clipboard.writeText(value);
  }
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0 w-[100px] text-text-muted">{label}</span>
      <span
        className={`flex-1 min-w-0 break-all ${mono ? "font-mono text-[11px]" : ""} ${error ? "text-rose-400" : "text-text-default"}`}
      >
        {value}
      </span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="flex-shrink-0 text-text-faint hover:text-text-default transition-colors"
          title="コピー"
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
            <rect x="3" y="3" width="6" height="6" rx="1" />
            <path d="M1 7V1h6" />
          </svg>
        </button>
      )}
    </div>
  );
}
