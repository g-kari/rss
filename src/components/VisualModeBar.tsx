"use client";

import { useState } from "react";
import { useVisualMode } from "../contexts/VisualModeContext";

/** Also used inside modal focus traps, never floated above somebody else's dialog. */
export function VisualModeSwitch({ onlyExit = false }: { onlyExit?: boolean }) {
  const { enabled, setEnabled } = useVisualMode();
  const [shown, setShown] = useState(enabled);
  if (onlyExit && !enabled && !shown) return null;
  return (
    <button
      type="button"
      className="visual-mode-switch"
      aria-pressed={enabled}
      onClick={() => {
        setShown(true);
        setEnabled(!enabled);
      }}
      title="記事・スクロール位置・読書設定を保ったまま表示を切り替えます"
    >
      <span aria-hidden="true">{enabled ? "◈" : "◇"}</span>
      {enabled ? "通常表示に戻す" : "ビジュアル表示"}
    </button>
  );
}

export default function VisualModeBar() {
  const { enabled, motionEnabled, toggleMotion, motionReason } = useVisualMode();
  return (
    <header className="visual-mode-bar" data-print="hide" aria-label="サイトの表示モード">
      <div className="visual-mode-brand" aria-hidden="true">
        <span className="visual-mode-orbit">◈</span>
        <span>{enabled ? "DOPA / READER" : "RSS READER"}</span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {enabled && (
          <button
            type="button"
            className="visual-motion-switch"
            aria-pressed={motionEnabled}
            onClick={toggleMotion}
            title={motionReason || "演出の動きを止める・再開する"}
          >
            {motionReason ? "軽量・静止" : motionEnabled ? "動き ON" : "動き OFF"}
          </button>
        )}
        <VisualModeSwitch />
      </div>
    </header>
  );
}
