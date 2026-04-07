"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Feed, Article } from "../types";
import { isArticleRead } from "../lib/article-filter";
import { SPECIAL_FEED_IDS } from "../lib/storage";

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
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
  articles,
  readIds,
  readBeforeTimestamp,
  selectedFeedId,
  onSelectFeed,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const unreadByFeed = useMemo(() => {
    const map = new Map<string, number>();
    for (const article of articles) {
      if (!isArticleRead(article, readIds, readBeforeTimestamp)) {
        map.set(article.feedHash, (map.get(article.feedHash) ?? 0) + 1);
      }
    }
    return map;
  }, [articles, readIds, readBeforeTimestamp]);

  const totalUnread = useMemo(
    () => [...unreadByFeed.values()].reduce((a, b) => a + b, 0),
    [unreadByFeed],
  );

  const allOptions: FeedOption[] = useMemo(
    () => [
      { id: null, label: "すべて", unreadCount: totalUnread },
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

  function handleKeyDown(e: React.KeyboardEvent) {
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
      <div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={onClose} />
      <div
        className="fixed z-50 inset-x-4 top-[15%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[400px] max-h-[65dvh] flex flex-col bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
            className="flex-1 bg-transparent text-[13px] text-text-strong placeholder-text-faint outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-text-faint hover:text-text-muted transition-colors flex-shrink-0"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          )}
        </div>

        <ul ref={listRef} className="overflow-y-auto py-1 flex-1 min-h-0">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-[12px] text-text-muted">
              見つかりませんでした
            </li>
          ) : (
            filtered.map((opt, i) => (
              <li key={opt.id ?? "__all__"}>
                <button
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
                      {opt.unreadCount > 99 ? "99+" : opt.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>

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
