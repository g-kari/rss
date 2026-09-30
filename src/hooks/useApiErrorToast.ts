"use client";

import { useEffect, useRef } from "react";
import { onApiError } from "../lib/api-fetch";

interface ToastApi {
  error: (msg: string) => void;
}

const TOAST_THROTTLE_MS = 3000;

/**
 * `apiFetch` 由来の通信エラーをトーストに集約する hook (#650 Step 1g)。
 *
 * 短時間に複数エラーが発生してもトーストは 3 秒に 1 回までに抑える
 * (UI ノイズ防止)。通知時刻は toast state/provider の再描画をまたいで保持する。
 */
export function useApiErrorToast(toast: ToastApi): void {
  const lastShownAtRef = useRef<number | null>(null);
  const { error } = toast;
  useEffect(() => {
    const unsubscribe = onApiError(({ message }) => {
      const now = Date.now();
      if (lastShownAtRef.current !== null && now - lastShownAtRef.current < TOAST_THROTTLE_MS)
        return;
      lastShownAtRef.current = now;
      error(`通信エラー: ${message}`);
    });
    return unsubscribe;
  }, [error]);
}
