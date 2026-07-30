"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import Backdrop from "./Backdrop";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { usePopupLock } from "@/hooks/usePopupLock";
import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";

type ArticleViewProps = ComponentProps<typeof ArticleView>;

interface Props {
  open: boolean;
  onClose: () => void;
  articleViewProps: ArticleViewProps;
}

const MIN_WIDTH = 360;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 560;
/** Arrow キー 1 押下あたりの移動量 (px)。WAI-ARIA Separator pattern 慣習値。 */
const RESIZE_STEP_PX = 8;
const RESIZE_STEP_PX_SHIFT = 32;

function loadWidth(): number {
  const n = parseInt(storageGet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH) ?? "", 10);
  return isNaN(n) ? DEFAULT_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

export default function ArticleDetailOverlay({ open, onClose, articleViewProps }: Props) {
  usePopupLock(open);
  const titleId = useId();
  const [width, setWidth] = useState<number>(() => loadWidth());
  const [mounted, setMounted] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // capture-phase Escape + Tab cycle focus trap を useModalFocusTrap に委譲。
  // captureEscape: true により他の keyboard shortcut hook より優先的に Escape を捕捉する。
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose,
    isOpen: open,
    captureEscape: true,
  });

  function handleResizeKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? RESIZE_STEP_PX_SHIFT : RESIZE_STEP_PX;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? 1 : -1; // 左ドラッグ = 幅増加と同じ方向
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width + dir * step));
      setWidth(next);
      storageSet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH, String(next));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(MAX_WIDTH);
      storageSet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH, String(MAX_WIDTH));
    } else if (e.key === "End") {
      e.preventDefault();
      setWidth(MIN_WIDTH);
      storageSet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH, String(MIN_WIDTH));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setWidth(DEFAULT_WIDTH);
      storageSet(STORAGE_KEYS.ARTICLE_DETAIL_OVERLAY_WIDTH, String(DEFAULT_WIDTH));
    }
  }

  function handleResizeStart(e: ReactMouseEvent) {
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
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex justify-end outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">
        記事詳細パネル
      </h2>
      {/* #1259: raw div + onClick だと本文テキスト選択の drag → パネル外 release でも
          close していたため Backdrop canonical (onPointerDown) に統一 */}
      <Backdrop onPointerDown={onClose} />
      <div
        className="relative z-50 h-full bg-surface-base shadow-2xl animate-slide-in-right flex flex-col overflow-hidden"
        style={{ width: `${width}px` }}
      >
        <div
          onMouseDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          tabIndex={0}
          className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize hover:bg-border-default/60 focus-visible:bg-border-default/60 transition-colors z-10 outline-none"
          aria-label="パネル幅をドラッグまたは Arrow キーでリサイズ"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center p-2 text-text-faint hover:text-text-muted transition-colors duration-200"
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
