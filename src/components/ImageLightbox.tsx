"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";

interface ImageLightboxProps {
  imageSrc: string;
  article: Article;
  /** 同記事内の前/次画像へナビゲーション (null なら境界) */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  /** サブメニューと統一: 記事を表示 */
  onSelectArticle: (article: Article) => void;
}

/**
 * 画像/動画 view のギャラリーで「カードクリック」した際の拡大表示。
 * Esc / 背景クリック / × ボタンで閉じる。←/→ キーで前後画像へナビゲート。
 *
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
  // Esc / ←/→ キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="画像拡大表示"
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
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

      {/* 前へボタン */}
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="前の画像"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors"
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
      )}

      {/* 次へボタン */}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label="次の画像"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors"
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
      )}

      {/* 中央: 画像 + メタ */}
      <div className="max-w-full max-h-full flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- proxy 経由でも `next/image` の domain 検証より柔軟、ライトボックスの単発描画 */}
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
