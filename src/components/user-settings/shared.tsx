"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { FontSize, FontFamily } from "../../types";
import type { ContentWidth, LineHeight } from "../../lib/reader-settings";
import { getLineHeightStyle, CONTENT_WIDTH_LABELS } from "../../lib/reader-settings";
import { FONT_SIZE_CLASSES, FONT_FAMILY_CLASSES } from "../../lib/article-utils";

// プレビュー領域内でのコンテンツ幅の視覚比率 (modal ~480px 内に収まる表示比率)
// 実値は 640 / 720 / 900 / none だが、モーダル内では全部が収まって見分けが付かないため
// 比率ベースで相対的な広さを表現する
export const CONTENT_WIDTH_PREVIEW_PCT: Record<ContentWidth, number> = {
  narrow: 55,
  medium: 70,
  wide: 85,
  full: 100,
};

// value:0 = "無制限" (明示的 unlimited)。null = "未設定" (default 30 日適用)。
// consumer 側で `ttlDays ?? 30` する場合、0 と null の意味乖離に注意 (0 ?? 30 = 0、null ?? 30 = 30)。
export const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7日" },
  { value: 14, label: "14日" },
  { value: 30, label: "30日" },
  { value: 60, label: "60日" },
  { value: 90, label: "90日" },
  { value: 0, label: "無制限" },
];

export const PREVIEW_TEXT =
  "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。" +
  "The quick brown fox jumps over the lazy dog. RSS リーダーの表示設定をプレビューしながら調整できますわ。";

export function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] font-medium text-text-default flex-shrink-0 w-24">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

export interface SegmentOption<T> {
  value: T;
  label: string;
}

export function SegmentGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const currentIndex = options.findIndex((opt) => opt.value === value);
    if (currentIndex === -1) return;
    const nextIndex =
      e.key === "ArrowRight"
        ? (currentIndex + 1) % options.length
        : (currentIndex - 1 + options.length) % options.length;
    onChange(options[nextIndex].value);
    // WAI-ARIA APG Radio Group: 選択切替と同時に focus も移動する (roving tabindex pattern)。
    // tabIndex は active な radio のみ 0 のため、focus を移さないと Tab 復帰時に
    // 選択済 radio へ戻れず WCAG 2.4.7 違反になる。canonical: FeedViewTabs.tsx
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className="inline-flex rounded-lg border border-border-default overflow-hidden"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-[11px] transition-colors duration-150 ${
              active
                ? "bg-ink text-ink-text"
                : "bg-surface-elevated text-text-muted hover:bg-surface-hover hover:text-text-default"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
  /** loading / API 呼出中の一時無効化。WCAG 2.5.8 準拠 24×44px を維持 */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors duration-150 disabled:opacity-50 ${
        checked ? "bg-ink" : "bg-border-default"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PreviewArea({
  fontSize,
  fontFamily,
  lineHeight,
  contentWidth,
  textJustify,
}: {
  fontSize: FontSize;
  fontFamily: FontFamily;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  textJustify: boolean;
}) {
  return (
    <div className="border border-border-subtle rounded-lg p-3 bg-surface-base">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          Preview
        </span>
        <span className="text-[10px] text-text-faint">幅 {CONTENT_WIDTH_LABELS[contentWidth]}</span>
      </div>
      <div
        className={`mx-auto ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} text-text-soft tracking-[0.02em]`}
        style={{
          ...getLineHeightStyle(lineHeight),
          width: `${CONTENT_WIDTH_PREVIEW_PCT[contentWidth]}%`,
          textAlign: textJustify ? "justify" : "left",
        }}
      >
        {PREVIEW_TEXT}
      </div>
    </div>
  );
}
