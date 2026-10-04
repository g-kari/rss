"use client";
import { useId, useLayoutEffect, useRef, type ComponentProps } from "react";
import { VisualModeSwitch } from "./VisualModeBar";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { usePopupLock } from "@/hooks/usePopupLock";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import { registerReaderFocusOverlay } from "@/hooks/useArticleViewShortcuts";
import { useEventListener } from "@/hooks/useEventListener";
import { getPopupOpenCount } from "@/lib/popup-lock";

type ArticleViewProps = ComponentProps<typeof ArticleView>;

interface Props {
  focusMode: boolean;
  exitFocusMode: () => void;
  articleViewProps: ArticleViewProps;
}

export default function FocusModeOverlay({ focusMode, exitFocusMode, articleViewProps }: Props) {
  usePopupLock(focusMode);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focusMode && dialogRef.current) return registerReaderFocusOverlay(dialogRef.current);
  }, [focusMode]);
  useEventListener(
    "keydown",
    (event) => {
      // Disabling the focused source button sends native keyboard events to
      // body. Recover Escape only for this sole popup; preserve editable and
      // nested-dialog handlers by leaving their targeted events untouched.
      if (
        focusMode &&
        event.key === "Escape" &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        event.target === document.body &&
        getPopupOpenCount() === 1
      ) {
        event.stopPropagation();
        exitFocusMode();
      }
    },
    document,
    true,
  );
  // Modal.tsx / ConfirmModal.tsx と同 canonical pattern: returnFocusRef + Tab cycle + Escape +
  // 初期 focus + `typeof ret.focus === "function"` safety guard を 1 hook に集約 (#790)。
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose: exitFocusMode,
    isOpen: focusMode,
    preventScrollOnReturn: true,
  });

  if (!focusMode) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-surface-base animate-slide-up overflow-hidden flex flex-col outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">
        フォーカスモード
      </h2>
      <button
        onClick={exitFocusMode}
        className="absolute top-4 right-4 z-10 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-faint hover:text-text-muted transition-colors duration-200"
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
      <div className="shrink-0 px-3 pr-16">
        <VisualModeSwitch onlyExit />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary label="フォーカスモード">
          <ArticleView {...articleViewProps} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
