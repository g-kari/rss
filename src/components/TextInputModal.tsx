"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePopupLock } from "@/hooks/usePopupLock";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import Backdrop from "./Backdrop";

interface Props {
  isOpen: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  minLength?: number;
  maxLength?: number;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * テキスト入力モーダル (`ConfirmModal` の text-input variant)。
 *
 * - `useTextInputModal` hook と組み合わせて Promise ベースで利用
 * - 入力 trim 後の `minLength` / `maxLength` で submit ブロック + エラー表示
 * - 開閉ごとに `initialValue` で input をリセット
 * - WAI-ARIA: `role="dialog"` / `aria-modal="true"` / `aria-labelledby` / `aria-describedby` / focus trap
 *
 * 設計は `ConfirmModal.tsx` を参考にしています (#881 案 A、useConfirm pattern の延長)。
 */
export default function TextInputModal({
  isOpen,
  title,
  description,
  placeholder,
  initialValue = "",
  minLength = 1,
  maxLength = 100,
  submitLabel = "OK",
  cancelLabel = "キャンセル",
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [showError, setShowError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  usePopupLock(isOpen);
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose: onCancel,
    isOpen,
    initialFocusRef: inputRef,
  });

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setShowError(false);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const isValid = trimmed.length >= minLength && trimmed.length <= maxLength;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setShowError(true);
      inputRef.current?.focus();
      return;
    }
    onSubmit(trimmed);
  };

  return createPortal(
    <>
      <Backdrop onPointerDown={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? `${titleId}-desc` : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[400px] bg-surface-elevated border border-border-default rounded-xl shadow-xl overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4">
            <h2 id={titleId} className="text-[13px] font-medium text-text-strong mb-2">
              {title}
            </h2>
            {description && (
              <p
                id={`${titleId}-desc`}
                className="text-[12px] text-text-soft leading-relaxed mb-3 whitespace-pre-wrap"
              >
                {description}
              </p>
            )}
            {/* #1209: placeholder 依存をやめて sr-only label で accessible name を与える
                (canonical: SearchBar / FeedSearchBar)。dialog title をそのまま label にする */}
            <label htmlFor={`${titleId}-input`} className="sr-only">
              {title}
            </label>
            <input
              id={`${titleId}-input`}
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (showError) setShowError(false);
              }}
              placeholder={placeholder}
              maxLength={maxLength}
              aria-invalid={showError && !isValid}
              aria-describedby={showError && !isValid ? `${titleId}-error` : undefined}
              className={`w-full min-h-[44px] px-3 py-2 text-[13px] rounded-lg border bg-surface-base text-text-strong placeholder:text-text-faint focus:outline-none focus:ring-2 transition-colors ${
                showError && !isValid
                  ? "border-error focus:ring-error/30"
                  : "border-border-default focus:ring-ink/30"
              }`}
            />
            {showError && !isValid && (
              <p id={`${titleId}-error`} role="alert" className="mt-2 text-[11px] text-error">
                {minLength === maxLength
                  ? `${minLength} 文字で入力してください`
                  : `${minLength}-${maxLength} 文字で入力してください`}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 text-[12px] rounded-lg bg-ink hover:bg-ink-hover text-ink-text transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
