"use client";

import { useEffect } from "react";
import { onApiError } from "../lib/api-fetch";

interface ToastApi {
  error: (msg: string) => void;
}

const TOAST_THROTTLE_MS = 3000;

/**
 * `apiFetch` 由来の通信エラーをトーストに集約する hook (#650 Step 1g)。
 *
 * 短時間に複数エラーが発生してもトーストは 3 秒に 1 回までに抑える
 * (UI ノイズ防止)。toast への参照変化で再購読する。
 */
export function useApiErrorToast(toast: ToastApi): void {
  useEffect(() => {
    let lastShownAt = 0;
    const unsubscribe = onApiError(({ message }) => {
      const now = Date.now();
      if (now - lastShownAt < TOAST_THROTTLE_MS) return;
      lastShownAt = now;
      toast.error(`通信エラー: ${message}`);
    });
    return unsubscribe;
  }, [toast]);
}
