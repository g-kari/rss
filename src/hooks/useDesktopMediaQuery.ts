"use client";

import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * デスクトップ幅 (≥1024px) かどうかを matchMedia でリアクティブに返す hook (#650 Step 1f)。
 *
 * SSR (window 未定義) では false を初期値とする。マウント後は matchMedia の
 * change イベントを購読してウィンドウリサイズに追従する。
 */
export function useDesktopMediaQuery(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}
