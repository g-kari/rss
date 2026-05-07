"use client";

import { useState, useCallback, useRef } from "react";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
}

/**
 * window.confirm の代替となるカスタム確認モーダル hook。
 *
 * 使い方:
 * ```
 * const { confirm, confirmModalProps } = useConfirm();
 * const ok = await confirm({ title: "削除確認", message: "本当に削除しますか？", danger: true });
 * if (ok) { ... }
 * ```
 *
 * `confirmModalProps` を `<ConfirmModal {...confirmModalProps} />` に渡す。
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: "",
    message: "",
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ isOpen: true, ...options });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const confirmModalProps = {
    isOpen: state.isOpen,
    title: state.title,
    message: state.message,
    confirmLabel: state.confirmLabel,
    cancelLabel: state.cancelLabel,
    danger: state.danger,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { confirm, confirmModalProps };
}
