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
  success: "text-toast-success",
  error: "text-toast-error",
  info: "text-text-muted",
  undo: "text-toast-undo",
};

function ToastCard({ toast, dismiss }: { toast: ToastItem; dismiss: (id: string) => void }) {
  return (
    <div
      className={`pointer-events-auto flex flex-col border-l-4 ${borderColor[toast.type]} bg-surface-elevated rounded-lg shadow-lg min-w-[240px] max-w-[360px] animate-fade-up overflow-hidden`}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-2.5">
        <svg
          aria-hidden="true"
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
            className="flex-shrink-0 max-md:min-h-[44px] max-md:min-w-[44px] lg:min-h-[24px] lg:min-w-[24px] flex items-center justify-center text-[13px] font-medium text-text-strong hover:text-ink-hover transition-colors"
          >
            元に戻す
          </button>
        )}
        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          className="flex-shrink-0 mt-px max-md:min-h-[44px] max-md:min-w-[44px] lg:min-h-[24px] lg:min-w-[24px] flex items-center justify-center text-text-faint hover:text-text-muted transition-colors"
          aria-label="閉じる"
        >
          <svg
            aria-hidden="true"
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
          <div className="h-full bg-toast-undo animate-undo-progress" />
        </div>
      )}
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  // WCAG 4.1.3 Status Messages: aria-live region は **toast 到着 _前_ に DOM に存在**
  // していないと SR (NVDA / JAWS / VoiceOver) が新規内容を announce しない仕様。
  // WAI-ARIA: role は動的変更禁止のため polite (通常) と assertive (undo) を分離する。
  const undoToasts = toasts.filter((t) => t.type === "undo");
  const otherToasts = toasts.filter((t) => t.type !== "undo");

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      <div role="status" aria-live="polite" aria-atomic="true" className="contents">
        {otherToasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="contents">
        {undoToasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
