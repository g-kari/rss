"use client";

import { useRef } from "react";

/** Existing local mode only; leaving it does not close the selected article. */
export default function NsfwModeSettings({
  enabled,
  onDeactivate,
}: {
  enabled: boolean;
  onDeactivate: () => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={group}
      role="group"
      aria-label="NSFW表示設定"
      tabIndex={-1}
      data-setting-id="nsfw-mode"
      className="space-y-2"
      onKeyDown={(event) => {
        if (event.key === " " && event.target === event.currentTarget) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <p aria-live="polite" className="text-control text-text-strong">
        {enabled ? "NSFW表示中" : "通常表示中"}
      </p>
      {enabled && (
        <button
          type="button"
          className="min-h-11 rounded border border-border-default px-2 py-2 text-xs leading-4 text-text-default hover:bg-surface-hover"
          title="NSFWモード解除（開いている記事は閉じません）"
          onClick={() => {
            group.current?.focus({ preventScroll: true });
            onDeactivate();
          }}
        >
          NSFWモード解除
        </button>
      )}
      <p className="text-meta text-text-muted">
        解除しても開いている記事は閉じません。RSS ロゴの長押しでも解除できます。
      </p>
    </div>
  );
}
