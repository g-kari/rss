"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import { computeContextMenuPosition } from "../lib/context-menu-position";
import Backdrop from "./Backdrop";

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
  onSnooze?: (article: Article) => void;
  onClose: () => void;
  /**
   * #976: Escape / onClose 後にフォーカスを返却する先の要素。
   * キーボードユーザーが Escape でメニューを閉じた際に、
   * リスト先頭から Tab し直す必要をなくす (WCAG 2.4.3 Focus Order)。
   */
  returnFocusEl?: HTMLElement | null;
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
 * - Escape で onClose + returnFocusEl へフォーカス返却 (#976, WCAG 2.4.3)
 * - 右クリック起点が多いが `returnFocusEl` prop でトリガー要素へフォーカス復元可能
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
  onSnooze,
  onClose,
  returnFocusEl,
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
          // #976: Escape でメニューを閉じた後、トリガー要素にフォーカスを返却
          // キーボードユーザーがリスト先頭から Tab し直す必要をなくす (WCAG 2.4.3)
          returnFocusEl?.focus();
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
    [getItems, onClose, returnFocusEl],
  );

  const btnClass =
    "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none transition-colors text-left";

  return createPortal(
    <>
      <Backdrop transparent onPointerDown={onClose} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="記事操作メニュー"
        onKeyDown={handleKeyDown}
        className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px]"
        style={computeContextMenuPosition(target.x, target.y, 180, 144)}
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
            aria-hidden="true"
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
            aria-hidden="true"
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
            aria-hidden="true"
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
              aria-hidden="true"
            >
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
            一覧から削除（既読化）
          </button>
        )}
        {onSnooze && (
          <button
            role="menuitem"
            className={btnClass}
            onClick={() => {
              onSnooze(target.article);
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
              aria-hidden="true"
            >
              <circle cx="6" cy="6" r="4.5" />
              <path d="M6 3.5V6l1.5 1.5" />
            </svg>
            スヌーズ
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
