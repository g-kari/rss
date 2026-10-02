"use client";

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { getFocusableElements } from "../lib/modal-focus";

// Only dialogs that actually own a live trap may consume a parent overlay's Escape.
const activeDialogRefs = new Set<RefObject<HTMLDivElement | null>>();

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
  /**
   * true にすると Escape listener を capture phase (document レベル) で登録する。
   * ArticleDetailOverlay のように他の keyboard shortcut より優先して Escape を捕捉したい場合に使用。
   * デフォルト false (既存の bubble-phase 動作、後方互換)。
   */
  captureEscape?: boolean;
  /**
   * close/unmount 時に復元するフォーカス先を上書きする。
   * SnoozeModal のように「モーダル open 後に元要素が DOM から消える」ケースで使用。
   * 省略時は Modal open 前の document.activeElement に戻る。
   */
  returnFocusEl?: HTMLElement | null;
  /** Preserve the current reader scroll position when returning from a small settings panel. */
  preventScrollOnReturn?: boolean;
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
 * - close 時 / unmount 時に returnFocusEl (指定時) または returnFocusRef へ focus 復元
 *
 * Modal.tsx (mount=open): `useModalFocusTrap(dialogRef, { onClose })`
 * ConfirmModal.tsx (常時 mount + isOpen): `useModalFocusTrap(dialogRef, { onClose: onCancel, isOpen, initialFocusRef: cancelRef })`
 * SnoozeModal.tsx 経由 Modal.tsx: `useModalFocusTrap(dialogRef, { onClose, returnFocusEl })`
 */
export function useModalFocusTrap(
  dialogRef: RefObject<HTMLDivElement | null>,
  options: UseModalFocusTrapOptions,
): UseModalFocusTrapResult {
  const {
    onClose,
    isOpen,
    initialFocusRef,
    captureEscape = false,
    returnFocusEl,
    preventScrollOnReturn = false,
  } = options;
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // open / mount 時に focus セットアップ + returnFocusRef 保存。
  // close / unmount 時に returnFocusRef へ focus 復元。
  // isOpen 未指定 (Modal.tsx pattern) の場合は mount = open として扱う。
  const openState = isOpen === undefined ? true : isOpen;
  useEffect(() => {
    if (openState) {
      activeDialogRefs.add(dialogRef);
      // 開く前のフォーカス位置を保存
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const target =
        initialFocusRef?.current ??
        (dialogRef.current ? getFocusableElements(dialogRef.current)[0] : null) ??
        dialogRef.current;
      target?.focus();
      return () => {
        activeDialogRefs.delete(dialogRef);
        // 閉じる時にトリガー要素へフォーカスを戻す。
        // returnFocusEl が指定されている場合はそちらを優先 (SnoozeModal のように open 後に元要素が DOM から消えるケース)。
        const ret = returnFocusEl ?? returnFocusRef.current;
        returnFocusRef.current = null;
        if (ret && typeof ret.focus === "function" && document.contains(ret)) {
          ret.focus({ preventScroll: preventScrollOnReturn });
        }
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialogRef / initialFocusRef / returnFocusEl は ref で identity 安定 (deps 不要)
  }, [openState]);

  // captureEscape: true の場合、capture phase で Escape を document レベルで捕捉する。
  // 他の keyboard shortcut hook より優先的に Escape を処理したい場合に使用 (ArticleDetailOverlay 等)。
  useEffect(() => {
    if (!captureEscape || !openState) return;
    function onCaptureKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // A nested (including portaled) dialog owns Escape before its reader overlay.
        const activeRefs = Array.from(activeDialogRefs);
        let owner = e.target instanceof Element ? e.target : null;
        while (owner && !activeRefs.some((ref) => ref.current === owner))
          owner = owner.parentElement;
        if (owner && owner !== dialogRef.current) return;
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onCaptureKey, true);
    return () => document.removeEventListener("keydown", onCaptureKey, true);
  }, [captureEscape, openState, onClose]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const dialog = dialogRef.current;
      // React portal events bubble through parents that do not contain their DOM.
      // Nested preset/health dialogs own their keyboard events independently.
      if (!dialog || (e.target instanceof Node && !dialog.contains(e.target))) return;
      // captureEscape: true の場合、Escape は capture phase で処理済みなので bubble phase では無視
      if (e.key === "Escape" && !captureEscape) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      // Search may focus an unavailable setting row or a panel with no controls.
      // A programmatic tabindex=-1 target still needs a route back into the trap.
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? focusable[focusable.length - 1] : focusable[0])!.focus();
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
    [dialogRef, onClose, captureEscape],
  );

  return { handleKeyDown };
}
