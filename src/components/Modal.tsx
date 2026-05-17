"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePopupLock } from "@/hooks/usePopupLock";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  /**
   * #707: コンテンツ高さが切り替わる Modal (タブ UI 等) で、
   * 垂直中央配置 (`top-1/2 -translate-y-1/2`) のままだと中身が伸縮するたびに
   * Modal 全体が「上下にぴょこぴょこ動く」体感バグになる。
   * 固定高さの Tailwind class (例: `sm:h-[640px]`) を渡すと jump を抑止できる。
   */
  height?: string;
}

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = "sm:w-[480px]",
  height = "",
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  usePopupLock();

  // #790 Phase 1: focus trap + return focus restore + Escape/Tab cycle を hook に集約。
  // 旧 useEffect + useCallback はすべて useModalFocusTrap に内包。
  const { handleKeyDown } = useModalFocusTrap(dialogRef, { onClose });

  return createPortal(
    <>
      <div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 ${width} ${height} max-h-[90dvh] flex flex-col bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle flex-shrink-0">
          <div>
            <span id={titleId} className="text-[13px] font-medium text-text-strong">
              {title}
            </span>
            {subtitle && (
              <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[280px]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-faint hover:text-text-default transition-colors"
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
        <div className="overflow-y-auto">{children}</div>
      </div>
    </>,
    document.body,
  );
}
