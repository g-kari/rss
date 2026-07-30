"use client";

import { useCallback, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import { usePopupLock } from "@/hooks/usePopupLock";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";

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
 * Modal.tsx canonical pattern (#768 / #833) に従い `useModalFocusTrap` で
 * focus trap + returnFocus 復元 + Escape close + Tab cycle を集約。
 * ←/→ キーは前後画像ナビ専用の別 handler で維持し、それ以外 (Escape / Tab) は
 * canonical hook の `handleKeyDown` に委譲する。
 */
export default function ImageLightbox({
  imageSrc,
  article,
  onPrev,
  onNext,
  onClose,
  onSelectArticle,
}: ImageLightboxProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  usePopupLock();

  // #833: focus trap + return focus restore + Escape/Tab cycle を hook に集約。
  // 旧 useEffect (mount 時退避 + cleanup 復元) と inline Tab/Shift+Tab ロジックは
  // すべて useModalFocusTrap に内包。
  const { handleKeyDown: trapKeyDown } = useModalFocusTrap(dialogRef, { onClose });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Arrow keydown は前後画像ナビ専用 (Modal.tsx canonical にない責務)
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
      // Escape / Tab / Shift+Tab は canonical hook に委譲
      trapKeyDown(e);
    },
    [trapKeyDown, onPrev, onNext],
  );

  // #1259: onClick だと拡大画像を drag → 背景で release したときも close していたため
  // onPointerDown に統一 (自身が backdrop 兼 dialog root のため Backdrop.tsx 導入は構造上困難)。
  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center outline-none"
      onPointerDown={handleBackgroundPointerDown}
    >
      <h2 id={titleId} className="sr-only">
        画像拡大表示
      </h2>
      {/* 閉じるボタン (右上) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
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
        className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
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
        className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 中央: 画像 + メタ (#886: 余白を限界まで削減して画像を最大表示) */}
      <div className="max-w-full max-h-full flex flex-col items-center gap-2">
        {/* #842: image-proxy を優先 — imageSrc が原 URL のままだと CORS 違反 / hotlink ブロックで読めないサイトがあるため、buildImageProxyUrl で proxy 経由に統一する。既に /api/image-proxy 経由なら no-op。 */}
        {/* eslint-disable-next-line @next/next/no-img-element -- proxy 経由でも next/image の domain 検証より柔軟、ライトボックスの単発描画 */}
        <img
          src={buildImageProxyUrl(imageSrc)}
          alt={article.title || "(画像)"}
          className="max-w-[96vw] max-h-[90vh] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <div
          className="flex flex-col items-center gap-1.5 text-white max-w-2xl"
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
