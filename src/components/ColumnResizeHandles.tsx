"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { COLUMN_LIMITS } from "../hooks/useColumnResize";

interface Props {
  listFocusMode: boolean;
  hasOpenPopup: boolean;
  sidebarWidth: number;
  listWidth: number;
  onResizeStart: (column: "sidebar" | "list", e: MouseEvent<HTMLDivElement>) => void;
  onResetWidth: (column: "sidebar" | "list") => void;
  onNudgeWidth: (column: "sidebar" | "list", deltaPx: number) => void;
}

/** ArrowLeft / ArrowRight 1 押下あたりの移動量 (px)。WAI-ARIA Separator pattern 慣習値。 */
const STEP_PX = 8;
/** Shift+Arrow の移動量 (px)。step の 4 倍で粗調整。 */
const STEP_PX_SHIFT = 32;

/**
 * 3 ペインレイアウトの「サイドバー / リスト」境界カラムリサイズハンドル (PC のみ)。
 *
 * App.tsx から分割 (#650 段階分割)、#887 WCAG 2.1.1 Keyboard 準拠で WAI-ARIA Separator
 * pattern + キーボード操作対応。
 *
 * - listFocusMode 時 / hasOpenPopup 時はリサイズ無効 (pointer-events-none)
 * - ダブルクリックで初期幅にリセット
 * - キーボード: Tab で focus、ArrowLeft / ArrowRight で 8px、Shift+Arrow で 32px、Home/End で min/max
 */
export default function ColumnResizeHandles({
  listFocusMode,
  hasOpenPopup,
  sidebarWidth,
  listWidth,
  onResizeStart,
  onResetWidth,
  onNudgeWidth,
}: Props) {
  if (listFocusMode) return null;
  const baseClass = `hidden lg:block absolute top-0 bottom-0 w-3 cursor-col-resize z-[5] group focus-visible:outline-none ${
    hasOpenPopup ? "pointer-events-none opacity-0" : ""
  }`;

  function handleKeyDown(column: "sidebar" | "list", e: KeyboardEvent<HTMLDivElement>) {
    const { min, max } = COLUMN_LIMITS[column];
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const step = e.shiftKey ? STEP_PX_SHIFT : STEP_PX;
        onNudgeWidth(column, dir * step);
        break;
      }
      case "Home":
        e.preventDefault();
        onNudgeWidth(column, -(max - min));
        break;
      case "End":
        e.preventDefault();
        onNudgeWidth(column, max - min);
        break;
      case "Enter":
      case " ":
        // ダブルクリックと同じくデフォルト幅に戻す
        e.preventDefault();
        onResetWidth(column);
        break;
    }
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={sidebarWidth}
        aria-valuemin={COLUMN_LIMITS.sidebar.min}
        aria-valuemax={COLUMN_LIMITS.sidebar.max}
        aria-label="サイドバー幅"
        tabIndex={hasOpenPopup ? -1 : 0}
        className={`${baseClass} focus-visible:bg-text-muted/30`}
        style={{ left: sidebarWidth - 2 }}
        onMouseDown={(e) => onResizeStart("sidebar", e)}
        onDoubleClick={() => onResetWidth("sidebar")}
        onKeyDown={(e) => handleKeyDown("sidebar", e)}
        aria-hidden={hasOpenPopup}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-default group-hover:bg-text-muted group-focus-visible:bg-text-muted transition-colors" />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={listWidth}
        aria-valuemin={COLUMN_LIMITS.list.min}
        aria-valuemax={COLUMN_LIMITS.list.max}
        aria-label="記事一覧幅"
        tabIndex={hasOpenPopup ? -1 : 0}
        className={`${baseClass} focus-visible:bg-text-muted/30`}
        style={{ left: sidebarWidth + listWidth - 2 }}
        onMouseDown={(e) => onResizeStart("list", e)}
        onDoubleClick={() => onResetWidth("list")}
        onKeyDown={(e) => handleKeyDown("list", e)}
        aria-hidden={hasOpenPopup}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-default group-hover:bg-text-muted group-focus-visible:bg-text-muted transition-colors" />
      </div>
    </>
  );
}
