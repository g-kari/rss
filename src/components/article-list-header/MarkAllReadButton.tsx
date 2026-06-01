"use client";

import { useState, useRef } from "react";
import { SHORTCUT_MAP } from "../../config/shortcuts";

interface MarkAllReadButtonProps {
  onMarkAllRead: () => void;
}

export default function MarkAllReadButton({ onMarkAllRead }: MarkAllReadButtonProps) {
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);
  const confirmMarkAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = () => {
    if (confirmMarkAll) {
      if (confirmMarkAllTimerRef.current) clearTimeout(confirmMarkAllTimerRef.current);
      confirmMarkAllTimerRef.current = null;
      setConfirmMarkAll(false);
      onMarkAllRead();
    } else {
      setConfirmMarkAll(true);
      confirmMarkAllTimerRef.current = setTimeout(() => {
        setConfirmMarkAll(false);
        confirmMarkAllTimerRef.current = null;
      }, 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label={confirmMarkAll ? "全記事を既読にする（確認）" : "全て既読にする"}
      title={confirmMarkAll ? "もう一度押すと全て既読にします" : `${SHORTCUT_MAP["m"]} (m)`}
      className={`relative overflow-hidden flex items-center justify-center rounded-full transition-all duration-200 ${
        confirmMarkAll
          ? "px-2 h-6 text-[10px] font-medium text-error border border-rose-400 hover:bg-rose-400/10"
          : "w-6 h-6 text-text-faint hover:text-text-muted hover:bg-surface-subtle"
      }`}
    >
      {confirmMarkAll ? (
        "全既読?"
      ) : (
        <svg
          aria-hidden={true}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="6" cy="6" r="4.5" />
          <path d="M3.5 6l1.8 1.8L8.5 4" />
        </svg>
      )}
      {confirmMarkAll && (
        // 確認状態のカウントダウン進捗バー: 3 秒で 100% → 0% に縮む細線。
        // ToastContainer の `undoProgress` keyframe (globals.css) を再利用し、
        // animationDuration: "3s" で setTimeout(3000) と同期させる。
        // CSS animation 完結のため 1 秒ごとの re-render は不要 (ui-rendering.md カラー規範: text-error と整合の rose-400)。
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-rose-400 animate-undo-progress"
          style={{ animationDuration: "3s" }}
        />
      )}
    </button>
  );
}
