"use client";

import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useMenuKeyboard } from "../hooks/useMenuKeyboard";
import type { Article } from "../types";
import { computeContextMenuPosition } from "../lib/context-menu-position";
import { BASE_MENU_CLASS } from "../lib/menu-class";
import Backdrop from "./Backdrop";
import { MENU_ITEM_CLS } from "./article-view/constants";

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
  // WCAG 2.4.3: menuitem click / Escape / backdrop dismiss の全 close 経路で
  // トリガー要素へ focus を返す canonical helper (#976 の Escape 分岐を全経路に横展開)。
  const closeAndRestore = useCallback(() => {
    onClose();
    returnFocusEl?.focus();
  }, [onClose, returnFocusEl]);

  // #1201: Arrow / Home / End / Escape / Tab トラップ + 開時 auto-focus は canonical
  // useMenuKeyboard に集約。returnFocusEl は ref 経由で渡す (hook が RefObject 契約のため)。
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusEl ?? null);
  returnFocusRef.current = returnFocusEl ?? null;
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, () => onClose(), returnFocusRef);

  return createPortal(
    <>
      <Backdrop transparent onPointerDown={closeAndRestore} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="記事操作メニュー"
        onKeyDown={handleKeyDown}
        className={`${BASE_MENU_CLASS} min-w-[180px]`}
        style={computeContextMenuPosition(target.x, target.y, 180, 144)}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          role="menuitem"
          className={MENU_ITEM_CLS}
          onClick={() => {
            onToggleRead(target.article.id);
            closeAndRestore();
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
          className={MENU_ITEM_CLS}
          onClick={() => {
            onToggleBookmark(target.article.id);
            closeAndRestore();
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
          className={MENU_ITEM_CLS}
          onClick={() => {
            onToggleReadingList(target.article.id);
            closeAndRestore();
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
            className={MENU_ITEM_CLS}
            onClick={() => {
              onToggleRead(target.article.id);
              closeAndRestore();
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
            className={MENU_ITEM_CLS}
            onClick={() => {
              onSnooze(target.article);
              closeAndRestore();
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
