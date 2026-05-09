"use client";

import { useEffect, useRef } from "react";

interface ToastApi {
  success: (msg: string) => void;
}

/**
 * オフライン → オンライン復帰時にトーストで通知する hook (#650 Step 1h)。
 *
 * 直前の online 状態を ref で保持し、false → true の遷移エッジでのみ
 * `接続が復帰しました` トーストを出す。初回マウント時は何もしない。
 */
export function useOnlineRecoveryToast(isOnline: boolean, toast: ToastApi): void {
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      toast.success("接続が復帰しました");
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, toast]);
}
