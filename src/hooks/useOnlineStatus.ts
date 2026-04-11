"use client";

import { useState } from "react";
import { useEventListener } from "./useEventListener";

/**
 * ブラウザのネットワーク接続状態を追跡する。
 * SSR 時は true（接続中）を返す。
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEventListener("online", () => setIsOnline(true));
  useEventListener("offline", () => setIsOnline(false));

  return isOnline;
}
