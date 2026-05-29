"use client";

import { useState, useCallback, useRef } from "react";

export interface TextInputModalOptions {
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  /** 入力 trim 後の最小長 (default: 1)。下回ると submit ブロック + エラー表示。 */
  minLength?: number;
  /** 入力 trim 後の最大長 (default: 100)。HTML input maxLength + 検証両方に適用。 */
  maxLength?: number;
  submitLabel?: string;
  cancelLabel?: string;
}

interface TextInputModalState extends TextInputModalOptions {
  isOpen: boolean;
}

/**
 * `window.prompt` の代替となるカスタム入力モーダル hook。`useConfirm` と同じ Promise ベース pattern。
 *
 * 使い方:
 * ```
 * const { requestTextInput, textInputModalProps } = useTextInputModal();
 * const name = await requestTextInput({ title: "preset 名", minLength: 1, maxLength: 30 });
 * if (name === null) return; // キャンセル
 * savePreset(name);
 * ```
 *
 * `textInputModalProps` を `<TextInputModal {...textInputModalProps} />` に渡す。
 *
 * (#881 `window.prompt` / `window.alert` 排除のため追加。)
 */
export function useTextInputModal() {
  const [state, setState] = useState<TextInputModalState>({
    isOpen: false,
    title: "",
  });
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const requestTextInput = useCallback((options: TextInputModalOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ isOpen: true, ...options });
    });
  }, []);

  const handleSubmit = useCallback((value: string) => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    resolveRef.current?.(null);
    resolveRef.current = null;
  }, []);

  const textInputModalProps = {
    isOpen: state.isOpen,
    title: state.title,
    description: state.description,
    placeholder: state.placeholder,
    initialValue: state.initialValue,
    minLength: state.minLength,
    maxLength: state.maxLength,
    submitLabel: state.submitLabel,
    cancelLabel: state.cancelLabel,
    onSubmit: handleSubmit,
    onCancel: handleCancel,
  };

  return { requestTextInput, textInputModalProps };
}
