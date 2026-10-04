"use client";

import { useState, useEffect, useRef } from "react";
import { useEventListener } from "./useEventListener";
import { getFocusHistoryExit, hasFocusHistoryOwner } from "./useFocusMode";

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
  const historyInitializedRef = useRef(false);
  const navigationIndexRef = useRef(0);

  // 前進時に history エントリを積む
  useEffect(() => {
    const prev = prevRef.current;
    if (!historyInitializedRef.current) {
      // Direct article/feed links also need a destination for focus-mode Back.
      const storedIndex = window.history.state?.mobilePaneNavigationIndex;
      if (Number.isSafeInteger(storedIndex)) navigationIndexRef.current = storedIndex;
      // A reloaded focus entry can become a new base when focus is reopened.
      // Give it its own position rather than duplicating the preceding pane.
      if (window.history.state?.focus) navigationIndexRef.current += 1;
      window.history.replaceState(
        {
          ...window.history.state,
          mobilePane,
          mobilePaneNavigationIndex: navigationIndexRef.current,
        },
        "",
      );
      historyInitializedRef.current = true;
    } else if (
      !hasFocusHistoryOwner() &&
      ((prev === "sidebar" && mobilePane === "list") || (prev === "list" && mobilePane === "view"))
    ) {
      // An unmounted focus owner can leave a departed marker at this base.
      // Ordinary pane navigation must not copy it into a new owned entry.
      if (window.history.state?.focus)
        window.history.replaceState({ ...window.history.state, focus: false }, "");
      navigationIndexRef.current += 1;
      window.history.pushState(
        {
          ...window.history.state,
          mobilePane,
          mobilePaneNavigationIndex: navigationIndexRef.current,
        },
        "",
      );
    } else if (prev !== mobilePane) {
      // In-app Back and pane changes inside focus replace its current entry.
      // A focus close must never be stranded behind a separate pane entry.
      window.history.replaceState({ ...window.history.state, mobilePane }, "");
    }
    prevRef.current = mobilePane;
  }, [mobilePane]);

  // popstate（戻るボタン）でペイン遷移を処理（フォーカスモード復帰はスキップ）
  useEventListener("popstate", (e: PopStateEvent) => {
    if (e.state?.focus) {
      // Forward can revisit a departed focus entry. Keep the visible pane and
      // make that entry a distinct base if useFocusMode later reopens from it.
      const storedIndex = e.state.mobilePaneNavigationIndex;
      const validIndex = Number.isSafeInteger(storedIndex) ? storedIndex : 0;
      navigationIndexRef.current = Math.max(navigationIndexRef.current, validIndex) + 1;
      window.history.replaceState(
        {
          ...window.history.state,
          mobilePane: prevRef.current,
          mobilePaneNavigationIndex: navigationIndexRef.current,
        },
        "",
      );
      return;
    }
    const destination = e.state?.mobilePane;
    const hasPane = destination === "sidebar" || destination === "list" || destination === "view";
    const destinationIndex = e.state?.mobilePaneNavigationIndex;
    const hasIndex = Number.isSafeInteger(destinationIndex);
    const samePaneEntry = hasIndex && destinationIndex === navigationIndexRef.current;
    const isBack = hasIndex && destinationIndex < navigationIndexRef.current;
    const focusExit = getFocusHistoryExit(e);
    const returningFocus =
      focusExit === "closing" || (focusExit === "open" && (!hasIndex || samePaneEntry));
    let nextPane: MobilePane;
    if (returningFocus || samePaneEntry) {
      // In-app Back may have changed the pane while focus was still open.
      nextPane = prevRef.current;
    } else if (!hasPane || !hasIndex || (isBack && destination === prevRef.current)) {
      // Legacy/router-replaced entries have no reliable direction. Keep the
      // previous-pane fallback and stamp the resolved entry for later Forward.
      nextPane = prevRef.current === "view" ? "list" : "sidebar";
    } else nextPane = destination;
    if (hasIndex) navigationIndexRef.current = destinationIndex;
    else if (!returningFocus) navigationIndexRef.current -= 1;
    if (nextPane !== destination || !hasIndex)
      window.history.replaceState(
        {
          ...window.history.state,
          mobilePane: nextPane,
          mobilePaneNavigationIndex: navigationIndexRef.current,
        },
        "",
      );
    // Record the destination first so Forward never pushes a new entry.
    prevRef.current = nextPane;
    setMobilePane(nextPane);
  });

  return { mobilePane, setMobilePane };
}
