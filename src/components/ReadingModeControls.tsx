"use client";

import { useRef } from "react";
import { useVisualMode } from "../contexts/VisualModeContext";

/** Visual presentation and sequential recommendations share one entry, with separate state. */
export default function ReadingModeControls({
  onEnterImmersive,
  ready,
  describedBy,
}: {
  onEnterImmersive: () => void;
  ready: boolean;
  describedBy?: string;
}) {
  const { enabled, setEnabled, motionEnabled, toggleMotion, motionReason } = useVisualMode();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const controlClass =
    "min-h-11 [@media(pointer:fine)]:min-h-8 rounded border border-border-default px-2 text-control text-text-strong hover:bg-surface-hover disabled:opacity-50";
  return (
    <details
      ref={details}
      className="group min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          details.current.open = false;
          summary.current?.focus();
        }
      }}
    >
      <summary
        ref={summary}
        className={`${controlClass} inline-flex cursor-pointer items-center gap-1 list-none`}
      >
        読み方 <span aria-hidden="true">▾</span>
        {enabled && (
          <span className="text-accent" aria-label="ビジュアル表示中">
            ●
          </span>
        )}
      </summary>
      <div
        className="mt-1 flex flex-wrap items-center gap-1 rounded border border-border-default bg-surface-elevated p-2"
        aria-label="読み方・表示モード"
      >
        <button
          type="button"
          className={controlClass}
          aria-pressed={enabled}
          onClick={() => setEnabled(!enabled)}
          title="表示だけを切り替えます。記事・読書設定は保持します"
        >
          ビジュアル表示
        </button>
        {enabled && (
          <button
            type="button"
            className={controlClass}
            aria-pressed={motionEnabled}
            onClick={toggleMotion}
            title={motionReason || "演出の動きを止める・再開する"}
          >
            {motionReason ? "軽量・静止" : motionEnabled ? "動き ON" : "動き OFF"}
          </button>
        )}
        <button
          type="button"
          className={controlClass}
          disabled={!ready}
          aria-haspopup="dialog"
          aria-describedby={describedBy}
          onClick={() => {
            if (details.current) details.current.open = false;
            summary.current?.focus();
            onEnterImmersive();
          }}
        >
          ドパガキモード
        </button>
        <p className="basis-full text-meta text-text-muted">
          ビジュアル表示は見た目、ドパガキモードはおすすめを順番に読む機能です。
        </p>
      </div>
    </details>
  );
}
