"use client";

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { FOCUSABLE_SELECTOR } from "../lib/modal-focus";

interface UseModalFocusTrapOptions {
  /** Modal close handler (Escape キーで発火) */
  onClose: () => void;
  /**
   * ConfirmModal のように常時 mount + isOpen prop で表示制御する場合に使用。
   * Modal.tsx (mount=open) では省略可。
   */
  isOpen?: boolean;
  /**
   * open 時に初期 focus する要素の ref。
   * 未指定なら dialog 内の最初の focusable を focus、それも無ければ dialog 自体を focus。
   * ConfirmModal は cancelRef を渡してキャンセルボタンを初期 focus にする。
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

interface UseModalFocusTrapResult {
  /** dialog の onKeyDown に配線する handler (Escape / Tab cycle) */
  handleKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Modal / Dialog 系コンポーネント共通の focus-trap hook (#790 Phase 1)。
 *
 * 責務:
 * - open 時に returnFocusRef = document.activeElement を保存
 * - open 時に initialFocusRef または最初の focusable に focus
 * - Escape キーで onClose 発火
 * - Tab / Shift+Tab で dialog 内 focus cycle (端で wrap)
 * - close 時 / unmount 時に returnFocusRef へ focus 復元 (元要素が DOM 内に残っている場合のみ)
 *
 * Modal.tsx (mount=open): `useModalFocusTrap(dialogRef, { onClose })`
 * ConfirmModal.tsx (常時 mount + isOpen): `useModalFocusTrap(dialogRef, { onClose: onCancel, isOpen, initialFocusRef: cancelRef })`
 */
export function useModalFocusTrap(
  dialogRef: RefObject<HTMLDivElement | null>,
  options: UseModalFocusTrapOptions,
): UseModalFocusTrapResult {
  const { onClose, isOpen, initialFocusRef } = options;
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // open / mount 時に focus セットアップ + returnFocusRef 保存。
  // close / unmount 時に returnFocusRef へ focus 復元。
  // isOpen 未指定 (Modal.tsx pattern) の場合は mount = open として扱う。
  const openState = isOpen === undefined ? true : isOpen;
  useEffect(() => {
    if (openState) {
      // 開く前のフォーカス位置を保存
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const target =
        initialFocusRef?.current ??
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        dialogRef.current;
      target?.focus();
      return () => {
        // 閉じる時にトリガー要素へフォーカスを戻す。トリガーが既に DOM から外れている場合はスキップ。
        const ret = returnFocusRef.current;
        returnFocusRef.current = null;
        if (ret && typeof ret.focus === "function" && document.contains(ret)) {
          ret.focus();
        }
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialogRef / initialFocusRef は ref で identity 安定 (deps 不要)
  }, [openState]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        onClose();
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
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
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
    [dialogRef, onClose],
  );

  return { handleKeyDown };
}
