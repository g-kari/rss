"use client";

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePopupLock } from "@/hooks/usePopupLock";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "確認",
  cancelLabel = "キャンセル",
  onConfirm,
  onCancel,
  danger = false,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // #687: モーダルを開いたトリガー要素を退避し、閉じるときに同じ要素へフォーカスを戻す
  // (WCAG 2.4.3 Focus Order)。Modal.tsx と同じパターン。
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // ConfirmModal は親（App.tsx）で常時マウントされ、内部で isOpen を見て表示制御するため、
  // usePopupLock も isOpen に連動させないとアプリ起動直後から常時ロックが立ってしまい、
  // カラム幅リサイザー等の `hasOpenPopup` で無効化する UI 要素が操作できなくなる (#606)。
  usePopupLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      // 開く前のフォーカス位置を保存
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      cancelRef.current?.focus();
    } else {
      // 閉じる時にトリガー要素へフォーカスを戻す。トリガーが既に DOM から外れている場合はスキップ。
      const ret = returnFocusRef.current;
      returnFocusRef.current = null;
      if (ret && typeof ret.focus === "function" && document.contains(ret)) {
        ret.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
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

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabIndex={-1}
        onKeyDown={handleTabKeyDown}
        className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[360px] bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h2 id="confirm-modal-title" className="text-[13px] font-medium text-text-strong mb-2">
            {title}
          </h2>
          <p className="text-[12px] text-text-soft leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 text-[12px] rounded-lg transition-colors ${
              danger
                ? "bg-rose-500 hover:bg-rose-600 text-white"
                : "bg-ink hover:bg-ink-hover text-ink-text"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
