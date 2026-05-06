"use client";

import { useState, useEffect, useRef } from "react";
import { useEventListener } from "./useEventListener";

/** モバイル向け3ペインのうちアクティブなペイン */
export type MobilePane = "sidebar" | "list" | "view";

/** ペインの順序インデックス（アニメーション方向計算用） */
const PANE_ORDER: Record<MobilePane, number> = {
  sidebar: 0,
  list: 1,
  view: 2,
};

/**
 * ペインのスライドアニメーション用 CSS transform 値を返す。
 *
 * アクティブペインは translateX(0%)、左側ペインは translateX(-100%)、
 * 右側ペインは translateX(100%) に配置する。
 */
export function getMobilePaneTransform(pane: MobilePane, activePane: MobilePane): string {
  const diff = PANE_ORDER[pane] - PANE_ORDER[activePane];
  if (diff === 0) return "translateX(0%)";
  if (diff < 0) return "translateX(-100%)";
  return "translateX(100%)";
}

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

  // popstate（戻るボタン）でペイン遷移を処理（フォーカスモード復帰はスキップ）
  useEventListener("popstate", (e: PopStateEvent) => {
    if (e.state?.focus) return;
    setMobilePane((current) => {
      if (current === "view") return "list";
      if (current === "list") return "sidebar";
      return current;
    });
  });

  return { mobilePane, setMobilePane };
}
