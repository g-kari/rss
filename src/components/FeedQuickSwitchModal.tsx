"use client";

import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Feed } from "../types";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { formatCount } from "../lib/article-utils";
import { usePopupLock } from "../hooks/usePopupLock";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { useUnreadStats } from "../contexts/UnreadStatsContext";
import Backdrop from "./Backdrop";

interface Props {
  feeds: Feed[];
  selectedFeedId: string | null;
  onSelectFeed: (id: string | null) => void;
  onClose: () => void;
}

interface FeedOption {
  id: string | null;
  label: string;
  category?: string;
  unreadCount: number;
}

export default function FeedQuickSwitchModal({
  feeds,
  selectedFeedId,
  onSelectFeed,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  usePopupLock();

  // #790 Phase 2: focus trap + return focus restore + Escape/Tab cycle を hook に集約。
  // 実装着手時の詳細 API 検証で trapTab option 追加不要と判明 (initialFocusRef option で inputRef を
  // 初期 focus に指定 + ArrowDown/Up/Enter は input handleKeyDown が独立処理、event bubble での
  // Escape 重複処理も onClose の idempotent 性で無害)。Phase 1 の signature 拡張提案を撤回。
  const { handleKeyDown: dialogKeyDown } = useModalFocusTrap(dialogRef, {
    onClose,
    initialFocusRef: inputRef,
  });

  const { unreadByFeed, totalUnread } = useUnreadStats();

  const allOptions: FeedOption[] = useMemo(
    () => [
      { id: null, label: "すべて", unreadCount: totalUnread },
      { id: SPECIAL_FEED_IDS.DIGEST, label: "ダイジェスト", unreadCount: 0 },
      { id: SPECIAL_FEED_IDS.BOOKMARKS, label: "ブックマーク", unreadCount: 0 },
      { id: SPECIAL_FEED_IDS.READING_LIST, label: "リーディングリスト", unreadCount: 0 },
      { id: SPECIAL_FEED_IDS.LIKES, label: "いいね", unreadCount: 0 },
      ...feeds.map((f) => ({
        id: f.id,
        label: f.title,
        category: f.category,
        unreadCount: unreadByFeed.get(f.id) ?? 0,
      })),
    ],
    [feeds, unreadByFeed, totalUnread],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) || (opt.category?.toLowerCase().includes(q) ?? false),
    );
  }, [allOptions, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    const item = listRef.current?.children[cursor] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      const opt = filtered[cursor];
      if (opt) {
        onSelectFeed(opt.id);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  const isSelected = (opt: FeedOption) =>
    opt.id === selectedFeedId || (opt.id === null && selectedFeedId === null);

  return createPortal(
    <>
      <Backdrop onPointerDown={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-quick-switch-title"
        tabIndex={-1}
        onKeyDown={dialogKeyDown}
        className="fixed z-50 inset-x-4 top-[15%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[400px] max-h-[65dvh] flex flex-col bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="feed-quick-switch-title" className="sr-only">
          フィードを素早く切り替え
        </h2>
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border-subtle flex-shrink-0">
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-text-muted flex-shrink-0"
            aria-hidden="true"
          >
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5l2.5 2.5" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="フィードを検索..."
            // ARIA combobox pattern (WAI-ARIA APG): screen reader にカーソル位置を読み上げさせる
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-controls="feed-quick-listbox"
            aria-activedescendant={filtered[cursor] ? `feed-quick-option-${cursor}` : undefined}
            className="flex-1 bg-transparent text-[13px] text-text-strong placeholder-text-faint outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="検索をクリア"
              className="max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] inline-flex items-center justify-center text-text-faint hover:text-text-muted transition-colors flex-shrink-0"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          )}
        </div>

        <div
          ref={listRef}
          id="feed-quick-listbox"
          role="listbox"
          aria-label="フィード候補"
          className="overflow-y-auto py-1 flex-1 min-h-0"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-text-muted">
              見つかりませんでした
            </div>
          ) : (
            // WAI-ARIA 1.2: role="option" は role="listbox" の直接子要素である必要がある。
            // 旧実装の `<li><button role="option"></button></li>` は listitem が間に入り
            // listbox → option の ownership chain が切れてスクリーンリーダーが activeDescendant を
            // 正しく announce できない。`<button>` 直配置で ownership を確立する。
            filtered.map((opt, i) => (
              <button
                key={opt.id ?? "__all__"}
                id={`feed-quick-option-${i}`}
                role="option"
                aria-selected={i === cursor}
                tabIndex={-1}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-100 ${
                  i === cursor ? "bg-surface-subtle" : "hover:bg-surface-hover"
                }`}
                onPointerDown={() => {
                  onSelectFeed(opt.id);
                  onClose();
                }}
                onMouseEnter={() => setCursor(i)}
              >
                <span
                  className={`flex-1 text-[13px] truncate ${isSelected(opt) ? "font-medium text-text-strong" : "text-text-default"}`}
                >
                  {opt.label}
                </span>
                {opt.category && (
                  <span className="text-[10px] text-text-faint truncate max-w-[80px] flex-shrink-0">
                    {opt.category}
                  </span>
                )}
                {opt.unreadCount > 0 && (
                  <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
                    {formatCount(opt.unreadCount)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-3 py-2 border-t border-border-subtle flex-shrink-0">
          <span className="text-[10px] text-text-faint">
            <kbd className="font-mono">↑↓</kbd> 移動
          </span>
          <span className="text-[10px] text-text-faint">
            <kbd className="font-mono">Enter</kbd> 選択
          </span>
          <span className="text-[10px] text-text-faint">
            <kbd className="font-mono">Esc</kbd> 閉じる
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}
