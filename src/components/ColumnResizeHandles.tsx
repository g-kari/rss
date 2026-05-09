"use client";

import type { MouseEvent } from "react";

interface Props {
  listFocusMode: boolean;
  hasOpenPopup: boolean;
  sidebarWidth: number;
  listWidth: number;
  onResizeStart: (column: "sidebar" | "list", e: MouseEvent<HTMLDivElement>) => void;
  onResetWidth: (column: "sidebar" | "list") => void;
}

/**
 * 3 ペインレイアウトの「サイドバー / リスト」境界カラムリサイズハンドル (PC のみ)。
 *
 * App.tsx から分割 (#650 段階分割)。
 * - listFocusMode 時 / hasOpenPopup 時はリサイズ無効 (pointer-events-none)
 * - ダブルクリックで初期幅にリセット
 */
export default function ColumnResizeHandles({
  listFocusMode,
  hasOpenPopup,
  sidebarWidth,
  listWidth,
  onResizeStart,
  onResetWidth,
}: Props) {
  if (listFocusMode) return null;
  const baseClass = `hidden lg:block absolute top-0 bottom-0 w-3 cursor-col-resize z-[5] group ${
    hasOpenPopup ? "pointer-events-none opacity-0" : ""
  }`;
  return (
    <>
      <div
        className={baseClass}
        style={{ left: sidebarWidth - 2 }}
        onMouseDown={(e) => onResizeStart("sidebar", e)}
        onDoubleClick={() => onResetWidth("sidebar")}
        aria-hidden={hasOpenPopup}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-default group-hover:bg-text-muted transition-colors" />
      </div>
      <div
        className={baseClass}
        style={{ left: sidebarWidth + listWidth - 2 }}
        onMouseDown={(e) => onResizeStart("list", e)}
        onDoubleClick={() => onResetWidth("list")}
        aria-hidden={hasOpenPopup}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-default group-hover:bg-text-muted transition-colors" />
      </div>
    </>
  );
}
