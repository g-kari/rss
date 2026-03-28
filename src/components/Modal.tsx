"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

/**
 * 汎用モーダルコンポーネント。
 * オーバーレイ・ヘッダー・閉じるボタン・Escape キーを提供し、document.body に portal する。
 * コンテンツ領域のスクロール・レイアウトは children 側で制御する。
 */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = "sm:w-[480px]",
}: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={onClose} />
      <div
        className={`fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 ${width} bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div>
            <span className="text-[13px] font-medium text-text-strong">{title}</span>
            {subtitle && (
              <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[280px]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
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
        {children}
      </div>
    </>,
    document.body,
  );
}
