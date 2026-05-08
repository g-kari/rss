"use client";
import type { ComponentProps } from "react";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { usePopupLock } from "@/hooks/usePopupLock";

type ArticleViewProps = ComponentProps<typeof ArticleView>;

interface Props {
  focusMode: boolean;
  exitFocusMode: () => void;
  articleViewProps: ArticleViewProps;
}

export default function FocusModeOverlay({ focusMode, exitFocusMode, articleViewProps }: Props) {
  usePopupLock(focusMode);
  if (!focusMode) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-surface-base animate-slide-up overflow-hidden flex flex-col"
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
