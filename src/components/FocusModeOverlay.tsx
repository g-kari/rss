"use client";
import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { usePopupLock } from "@/hooks/usePopupLock";

type ArticleViewProps = ComponentProps<typeof ArticleView>;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  focusMode: boolean;
  exitFocusMode: () => void;
  articleViewProps: ArticleViewProps;
}

export default function FocusModeOverlay({ focusMode, exitFocusMode, articleViewProps }: Props) {
  usePopupLock(focusMode);
  // WCAG 2.4.3: フォーカスモード終了時に元のフォーカス位置へ戻す (#687 ConfirmModal と同パターン)
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusMode) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
    } else {
      const ret = returnFocusRef.current;
      returnFocusRef.current = null;
      if (ret && document.contains(ret)) ret.focus();
    }
  }, [focusMode]);

  // フォーカストラップ: Modal.tsx と同パターン。Tab で最後の要素 → 最初の要素、
  // Shift+Tab で最初の要素 → 最後の要素へ循環させ、ダイアログ外へ抜けない。
  // Escape でフォーカスモード終了。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        exitFocusMode();
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
    [exitFocusMode],
  );

  if (!focusMode) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-surface-base animate-slide-up overflow-hidden flex flex-col outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="フォーカスモード"
    >
      <button
        onClick={exitFocusMode}
        className="absolute top-4 right-4 z-10 p-2 text-text-faint hover:text-text-muted transition-colors duration-200"
        aria-label="フォーカスモード終了"
        title="フォーカスモード終了 (Esc)"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 4l12 12M16 4l-12 12" />
        </svg>
      </button>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary label="フォーカスモード">
          <ArticleView {...articleViewProps} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
