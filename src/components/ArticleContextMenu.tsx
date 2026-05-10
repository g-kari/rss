"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";

export interface ArticleContextMenuTarget {
  article: Article;
  x: number;
  y: number;
}

interface ArticleContextMenuProps {
  target: ArticleContextMenuTarget;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onToggleReadingList: (id: string) => void;
  onClose: () => void;
}

/**
 * 記事一覧（compact / list / card / magazine レイアウト）の右クリックメニュー (#633 A3)。
 *
 * gallery レイアウト用の `GalleryContextMenu` は画像保存系の機能を含むため
 * 別コンポーネントとして残し、こちらは記事メタ操作（既読・ブックマーク・後で読む）
 * のみを提供する軽量版。
 *
 * a11y (#701, WCAG 2.1.1 Keyboard Level A):
 * - `role="menu"` / `role="menuitem"` でセマンティック付与
 * - メニュー開時に最初の項目へ自動フォーカス
 * - ArrowDown/Up/Home/End/Tab で項目間移動
 * - Escape で onClose
 * - 右クリック起点なのでトリガーボタンへのフォーカス復元はなし
 *   (`useMenuKeyboard` は btnRef 必須のため独自実装)
 */
export default function ArticleContextMenu({
  target,
  readIds,
  bookmarkIds,
  readingListIds,
  onToggleRead,
  onToggleBookmark,
  onToggleReadingList,
  onClose,
}: ArticleContextMenuProps) {
  const isRead = readIds.has(target.article.id);
  const isBookmarked = bookmarkIds.has(target.article.id);
  const isInReadingList = readingListIds.has(target.article.id);
  const menuRef = useRef<HTMLDivElement>(null);

  const getItems = useCallback((): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }, []);

  // メニュー開時に最初の項目にフォーカス (rAF で portal 挿入後を待つ)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const items = getItems();
      if (items.length > 0) items[0].focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [getItems]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const items = getItems();
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[next].focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prev].focus();
          break;
        }
        case "Home": {
          e.preventDefault();
          items[0].focus();
          break;
        }
        case "End": {
          e.preventDefault();
          items[items.length - 1].focus();
          break;
        }
        case "Escape": {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        }
        case "Tab": {
          // フォーカストラップ: メニュー外に出さない
          e.preventDefault();
          if (e.shiftKey) {
            const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            items[prev].focus();
          } else {
            const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            items[next].focus();
          }
          break;
        }
      }
    },
    [getItems, onClose],
  );

  const btnClass =
    "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none transition-colors text-left";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[49]" onPointerDown={onClose} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="記事操作メニュー"
        onKeyDown={handleKeyDown}
        className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px]"
        style={(() => {
          const MIN_W = 180;
          const EST_H = 144;
          const left = Math.min(target.x, window.innerWidth - MIN_W - 4);
          const spaceBelow = window.innerHeight - target.y;
          if (spaceBelow >= EST_H) {
            return { top: target.y, left: Math.max(4, left) };
          }
          return { bottom: window.innerHeight - target.y, left: Math.max(4, left) };
        })()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          role="menuitem"
          className={btnClass}
          onClick={() => {
            onToggleRead(target.article.id);
            onClose();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6l3 3 5-5" />
          </svg>
          {isRead ? "未読にする" : "既読にする"}
        </button>

        <button
          role="menuitem"
          className={btnClass}
          onClick={() => {
            onToggleBookmark(target.article.id);
            onClose();
          }}
        >
          <svg
            width="11"
            height="13"
            viewBox="0 0 11 13"
            fill={isBookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isBookmarked ? "text-bookmark" : ""}
          >
            <path d="M1 1h9v11l-4.5-3L1 12V1z" />
          </svg>
          {isBookmarked ? "ブックマーク解除" : "ブックマーク"}
        </button>

        <button
          role="menuitem"
          className={btnClass}
          onClick={() => {
            onToggleReadingList(target.article.id);
            onClose();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="6" r="4.5" />
            <path d="M6 3.5v2.7L7.6 7" />
          </svg>
          {isInReadingList ? "後で読むから解除" : "後で読む"}
        </button>

        {!isRead && (
          <button
            role="menuitem"
            className={btnClass}
            onClick={() => {
              onToggleRead(target.article.id);
              onClose();
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
            一覧から削除（既読化）
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
