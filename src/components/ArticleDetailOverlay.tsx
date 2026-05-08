"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { usePopupLock } from "@/hooks/usePopupLock";
import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage";

type ArticleViewProps = ComponentProps<typeof ArticleView>;

interface Props {
  open: boolean;
  onClose: () => void;
  articleViewProps: ArticleViewProps;
}

const MIN_WIDTH = 360;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 560;

function loadWidth(): number {
  const n = parseInt(storageGet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH) ?? "", 10);
  return isNaN(n) ? DEFAULT_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

export default function ArticleDetailOverlay({ open, onClose, articleViewProps }: Props) {
  usePopupLock(open);
  const [width, setWidth] = useState<number>(() => loadWidth());
  const [mounted, setMounted] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const { startX, startWidth } = dragRef.current;
      // パネルは画面右端固定なので、左ドラッグ = 幅増加
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (startX - ev.clientX)));
      setWidth(next);
      storageSet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH, String(next));
    }

    function onMouseUp() {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="記事詳細パネル"
    >
      <div
        className="absolute inset-0 bg-black/30 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative h-full bg-surface-base shadow-2xl animate-slide-in-right flex flex-col overflow-hidden"
        style={{ width: `${width}px` }}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize hover:bg-border-default/60 transition-colors z-10"
          aria-label="パネル幅をドラッグでリサイズ"
          role="separator"
          aria-orientation="vertical"
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-text-faint hover:text-text-muted transition-colors duration-200"
          aria-label="記事詳細パネルを閉じる"
          title="閉じる (Esc)"
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
          <ErrorBoundary label="記事詳細パネル">
            <ArticleView {...articleViewProps} />
          </ErrorBoundary>
        </div>
      </div>
    </div>,
    document.body,
  );
}
