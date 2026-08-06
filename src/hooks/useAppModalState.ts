"use client";

import { useState } from "react";
import { useEventListener } from "./useEventListener";

interface AppModalState {
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
  showFeedSwitcher: boolean;
  setShowFeedSwitcher: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
}

/**
 * App.tsx のグローバルモーダル開閉 state とキーボードショートカットを集約する hook (#650 Step 1d)。
 *
 * - `?` キーでヘルプモーダルをトグル
 * - `,` キーでユーザー設定モーダルをトグル
 * - `Escape` キーでヘルプとフィード切替モーダルを閉じる
 *   (Settings は ESC で閉じない設計 — モーダル内部の操作と衝突するため)
 *
 * フォーカスモードの Escape は useFocusMode 側で別途処理される（責務分離）。
 * input/textarea にフォーカスがあるときはショートカットを無効化。
 */
export function useAppModalState(): AppModalState {
  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?") setShowHelp((v) => !v);
      if (e.key === ",") setShowSettings((v) => !v);
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowFeedSwitcher(false);
      }
    },
    document,
  );

  return {
    showHelp,
    setShowHelp,
    showFeedSwitcher,
    setShowFeedSwitcher,
    showSettings,
    setShowSettings,
  };
}
