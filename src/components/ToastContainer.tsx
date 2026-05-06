"use client";

import { createPortal } from "react-dom";
import { useToast } from "@/contexts/ToastContext";
import type { ToastItem } from "@/hooks/useToast";

const borderColor: Record<ToastItem["type"], string> = {
  success: "border-l-emerald-500",
  error: "border-l-rose-500",
  info: "border-l-text-muted",
  undo: "border-l-amber-500",
};

const iconPath: Record<ToastItem["type"], string> = {
  success: "M5 13l4 4L19 7",
  error: "M6 18L18 6M6 6l12 12",
  info: "M13 16h-1v-4h-1m1-4h.01",
  undo: "M3 10h10a5 5 0 0 1 0 10H9M3 10l4-4M3 10l4 4",
};

const iconColor: Record<ToastItem["type"], string> = {
  success: "text-emerald-500",
  error: "text-rose-500",
  info: "text-text-muted",
  undo: "text-amber-500",
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex flex-col border-l-4 ${borderColor[toast.type]} bg-surface-elevated rounded-lg shadow-lg min-w-[240px] max-w-[360px] animate-fade-up overflow-hidden`}
        >
          <div className="flex items-start gap-2.5 px-3.5 py-2.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`mt-px flex-shrink-0 ${iconColor[toast.type]}`}
            >
              <path d={iconPath[toast.type]} />
            </svg>
            <span className="flex-1 text-[13px] text-text-default leading-snug break-words">
              {toast.message}
            </span>
            {toast.type === "undo" && toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo!();
                  dismiss(toast.id);
                }}
                className="flex-shrink-0 text-[13px] font-medium text-text-strong hover:text-ink-hover transition-colors"
              >
                元に戻す
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="flex-shrink-0 mt-px text-text-faint hover:text-text-muted transition-colors"
              aria-label="閉じる"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {toast.type === "undo" && (
            <div className="h-0.5 w-full bg-border-subtle">
              <div className="h-full bg-amber-500 animate-undo-progress" />
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
