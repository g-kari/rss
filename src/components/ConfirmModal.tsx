"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { usePopupLock } from "@/hooks/usePopupLock";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import Backdrop from "./Backdrop";

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
  // 同 Modal が並列で複数描画される (portal / 入れ子 dialog) ケースで ID 衝突を防ぐ。
  // canonical: Modal.tsx — `useId()` で生成した値を `aria-labelledby` と `<h2 id>` の両方に紐付ける。
  const titleId = useId();
  // ConfirmModal は親（App.tsx）で常時マウントされ、内部で isOpen を見て表示制御するため、
  // usePopupLock も isOpen に連動させないとアプリ起動直後から常時ロックが立ってしまい、
  // カラム幅リサイザー等の `hasOpenPopup` で無効化する UI 要素が操作できなくなる (#606)。
  usePopupLock(isOpen);

  // #790 Phase 1: focus trap + return focus restore + Escape/Tab cycle を hook に集約。
  // isOpen 連動 + cancelRef を初期 focus 対象に指定 (Modal.tsx と異なり「キャンセル」を default focus)。
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose: onCancel,
    isOpen,
    initialFocusRef: cancelRef,
  });

  if (!isOpen) return null;

  return createPortal(
    <>
      <Backdrop onPointerDown={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-desc`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[360px] bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-[13px] font-medium text-text-strong mb-2">
            {title}
          </h2>
          <p
            id={`${titleId}-desc`}
            className="text-[12px] text-text-soft leading-relaxed whitespace-pre-wrap"
          >
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            aria-describedby={danger ? `${titleId}-desc` : undefined}
            className={`min-h-[44px] px-4 py-2 text-[12px] rounded-lg transition-colors ${
              danger
                ? "bg-action-danger hover:bg-action-danger-hover text-white"
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
