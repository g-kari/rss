"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import { usePopupLock } from "@/hooks/usePopupLock";
import { FOCUSABLE_SELECTOR } from "@/lib/modal-focus";

interface ImageLightboxProps {
  imageSrc: string;
  article: Article;
  /** 同記事内の前/次画像へナビゲーション (null なら境界、ボタンは disabled で表示) */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  /** サブメニューと統一: 記事を表示 */
  onSelectArticle: (article: Article) => void;
}

/**
 * 画像/動画 view のギャラリーで「カードクリック」した際の拡大表示。
 * Modal.tsx canonical pattern (#768) に従い focus trap + focus restoration を実装。
 * Esc / 背景クリック / × ボタンで閉じる。←/→ キーで前後画像へナビゲート。
 * 記事詳細を見たい場合は「記事を表示」ボタンで onSelectArticle を呼ぶ。
 */
export default function ImageLightbox({
  imageSrc,
  article,
  onPrev,
  onNext,
  onClose,
  onSelectArticle,
}: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  usePopupLock();

  // mount 時: トリガー要素を退避 + 初期 focus、cleanup で復元 (Modal.tsx と同 pattern)
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const el = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (el) {
      el.focus();
    } else {
      dialogRef.current?.focus();
    }
    return () => {
      const ret = returnFocusRef.current;
      if (ret && typeof ret.focus === "function" && document.contains(ret)) {
        ret.focus();
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
        return;
      }
      if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key !== "Tab") return;
      // Tab trap: 焦点を modal 内で循環させる (Modal.tsx と同 pattern)
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || document.activeElement === dialog) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, onPrev, onNext],
  );

  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="画像拡大表示"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 outline-none"
      onClick={handleBackgroundClick}
    >
      {/* 閉じるボタン (右上) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
        </svg>
      </button>

      {/* 前へボタン (常時 mount、境界では disabled) */}
      <button
        type="button"
        onClick={() => onPrev?.()}
        disabled={!onPrev}
        aria-disabled={!onPrev}
        aria-label="前の画像"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 次へボタン (常時 mount、境界では disabled) */}
      <button
        type="button"
        onClick={() => onNext?.()}
        disabled={!onNext}
        aria-disabled={!onNext}
        aria-label="次の画像"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 中央: 画像 + メタ */}
      <div className="max-w-full max-h-full flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- proxy 経由でも next/image の domain 検証より柔軟、ライトボックスの単発描画 */}
        <img
          src={imageSrc}
          alt={article.title || "(画像)"}
          className="max-w-full max-h-[80vh] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <div
          className="flex flex-col items-center gap-2 text-white max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[13px] line-clamp-2 text-center px-3">
            {article.title || "(タイトルなし)"}
          </p>
          <button
            type="button"
            onClick={() => {
              onSelectArticle(article);
              onClose();
            }}
            className="px-3 py-1.5 rounded-md text-[12px] bg-white/15 hover:bg-white/25 transition-colors"
          >
            記事を表示
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
