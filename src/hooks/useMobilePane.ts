"use client";

import { useState, useEffect, useRef } from "react";
import { useEventListener } from "./useEventListener";

/** モバイル向け3ペインのうちアクティブなペイン */
export type MobilePane = "sidebar" | "list" | "view";

/**
 * モバイル向けペイン切り替えを管理するフック。
 *
 * sidebar → list → view の前進時にブラウザ履歴を pushState して積む。
 * ブラウザの戻るボタン（popstate）で逆順に遷移できる。
 *
 * @param initial - 初期ペイン
 */
export function useMobilePane(initial: MobilePane) {
  const [mobilePane, setMobilePane] = useState<MobilePane>(initial);
  const prevRef = useRef<MobilePane>(initial);

  // 前進時に history エントリを積む
  useEffect(() => {
    const prev = prevRef.current;
    if (
      (prev === "sidebar" && mobilePane === "list") ||
      (prev === "list" && mobilePane === "view")
    ) {
      window.history.pushState({ mobilePane }, "");
    }
    prevRef.current = mobilePane;
  }, [mobilePane]);

  // popstate（戻るボタン）でペイン遷移を処理
  useEventListener("popstate", () => {
    setMobilePane((current) => {
      if (current === "view") return "list";
      if (current === "list") return "sidebar";
      return current;
    });
  });

  return { mobilePane, setMobilePane };
}
