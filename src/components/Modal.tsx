"use client";

import { useId, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePopupLock } from "@/hooks/usePopupLock";

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = "sm:w-[480px]",
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  usePopupLock();

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
    [onClose],
  );

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
        className={`fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 ${width} max-h-[90dvh] flex flex-col bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden outline-none`}
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
        <div className="overflow-y-auto">{children}</div>
      </div>
    </>,
    document.body,
  );
}
