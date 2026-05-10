"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { usePopupLock } from "@/hooks/usePopupLock";
import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage";

type ArticleViewProps = ComponentProps<typeof ArticleView>;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  // WCAG 2.4.3: パネルが閉じたら開いたトリガー要素にフォーカスを戻す (Modal.tsx と同パターン)
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // open 切替時の focus 退避・初期 focus・復元 (Modal.tsx と同パターン)
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      // mounted 後 (createPortal が描画後) に dialog 内の最初の focusable を取得
      // useState の setMounted は別 effect なので setTimeout で 1 tick 待つ
      const id = window.setTimeout(() => {
        const el = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (el) el.focus();
        else dialogRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    const ret = returnFocusRef.current;
    returnFocusRef.current = null;
    if (ret && document.contains(ret)) ret.focus();
  }, [open]);

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

  // フォーカストラップ: Modal.tsx と同パターン (Tab で循環、Shift+Tab で逆循環)
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
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
  }, []);

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
