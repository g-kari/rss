"use client";

import type { Layout } from "../../types";
import LayoutIcon from "../LayoutIcon";
import { LAYOUT_CYCLE } from "../../lib/article-utils";
import { LAYOUT_ARIA_LABELS } from "./constants";

interface LayoutSwitcherProps {
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  listFocusMode: boolean;
  onToggleListFocusMode: () => void;
}

export default function LayoutSwitcher({
  layout,
  onChangeLayout,
  listFocusMode,
  onToggleListFocusMode,
}: LayoutSwitcherProps) {
  return (
    <div className="flex items-center gap-0.5">
      {LAYOUT_CYCLE.map((l) => (
        <button
          key={l}
          onClick={() => onChangeLayout(l)}
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 ${
            layout === l
              ? "text-text-strong bg-surface-subtle"
              : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
          }`}
          title={LAYOUT_ARIA_LABELS[l]}
          aria-label={LAYOUT_ARIA_LABELS[l]}
          aria-pressed={layout === l}
        >
          <LayoutIcon layout={l} />
        </button>
      ))}
      {/* 記事一覧フォーカスモード切替 */}
      <button
        onClick={onToggleListFocusMode}
        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 ${
          listFocusMode
            ? "text-text-strong bg-surface-subtle"
            : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
        }`}
        title={listFocusMode ? "記事一覧フォーカス終了 (|)" : "記事一覧フォーカス (|)"}
        aria-label={listFocusMode ? "記事一覧フォーカス終了" : "記事一覧フォーカス"}
        aria-pressed={listFocusMode}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {listFocusMode ? (
            <>
              <path d="M9 9L3 3m0 0h6m-6 0v6" />
              <path d="M15 9l6-6m0 0h-6m6 0v6" />
              <path d="M9 15l-6 6m0 0h6m-6 0v-6" />
              <path d="M15 15l6 6m0 0h-6m6 0v-6" />
            </>
          ) : (
            <>
              <path d="M3 9V3m0 0h6M3 3l6 6" />
              <path d="M21 9V3m0 0h-6m6 0l-6 6" />
              <path d="M3 15v6m0 0h6m-6 0l6-6" />
              <path d="M21 15v6m0 0h-6m6 0l-6-6" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
