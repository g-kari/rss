/**
 * リーダー表示設定ユーティリティ
 *
 * フォントサイズ (6段階) / 行間 (5段階) / コンテンツ幅 (4段階) の
 * 定数・CSS スタイル生成・サイクル関数を提供する。
 */

import type { CSSProperties } from "react";

// ===== フォントサイズ (拡張: 6段階) =====

export type FontSizeExtended = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export const FONT_SIZE_CYCLE_EXTENDED: FontSizeExtended[] = ["xs", "sm", "md", "lg", "xl", "2xl"];

const FONT_SIZE_PX: Record<FontSizeExtended, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 22,
};

export const FONT_SIZE_EXTENDED_LABELS: Record<FontSizeExtended, string> = {
  xs: "12",
  sm: "14",
  md: "16",
  lg: "18",
  xl: "20",
  "2xl": "22",
};

/** フォントサイズに対応する CSSProperties を返す */
export function getFontSizeStyle(size: FontSizeExtended): CSSProperties {
  return { fontSize: `${FONT_SIZE_PX[size]}px` };
}

/** 次のフォントサイズを返す（末尾から先頭に戻る） */
export function cycleFontSizeExtended(current: FontSizeExtended): FontSizeExtended {
  const idx = FONT_SIZE_CYCLE_EXTENDED.indexOf(current);
  return FONT_SIZE_CYCLE_EXTENDED[(idx + 1) % FONT_SIZE_CYCLE_EXTENDED.length];
}

// ===== 行間 =====

export type LineHeight = "tight" | "snug" | "normal" | "relaxed" | "loose";

export const LINE_HEIGHT_CYCLE: LineHeight[] = ["tight", "snug", "normal", "relaxed", "loose"];

const LINE_HEIGHT_VALUES: Record<LineHeight, number> = {
  tight: 1.5,
  snug: 1.7,
  normal: 1.9,
  relaxed: 2.1,
  loose: 2.3,
};

export const LINE_HEIGHT_LABELS: Record<LineHeight, string> = {
  tight: "1.5",
  snug: "1.7",
  normal: "1.9",
  relaxed: "2.1",
  loose: "2.3",
};

/** 行間に対応する CSSProperties を返す */
export function getLineHeightStyle(lh: LineHeight): CSSProperties {
  return { lineHeight: LINE_HEIGHT_VALUES[lh] };
}

/** 次の行間を返す（末尾から先頭に戻る） */
export function cycleLineHeight(current: LineHeight): LineHeight {
  const idx = LINE_HEIGHT_CYCLE.indexOf(current);
  return LINE_HEIGHT_CYCLE[(idx + 1) % LINE_HEIGHT_CYCLE.length];
}

// ===== コンテンツ幅 =====

export type ContentWidth = "narrow" | "medium" | "wide" | "full";

export const CONTENT_WIDTH_CYCLE: ContentWidth[] = ["narrow", "medium", "wide", "full"];

const CONTENT_WIDTH_VALUES: Record<ContentWidth, string> = {
  narrow: "640px",
  medium: "720px",
  wide: "900px",
  full: "none",
};

export const CONTENT_WIDTH_LABELS: Record<ContentWidth, string> = {
  narrow: "640",
  medium: "720",
  wide: "900",
  full: "全幅",
};

/** コンテンツ幅に対応する CSSProperties を返す */
export function getContentWidthStyle(width: ContentWidth): CSSProperties {
  return { maxWidth: CONTENT_WIDTH_VALUES[width] };
}

/** 次のコンテンツ幅を返す（末尾から先頭に戻る） */
export function cycleContentWidth(current: ContentWidth): ContentWidth {
  const idx = CONTENT_WIDTH_CYCLE.indexOf(current);
  return CONTENT_WIDTH_CYCLE[(idx + 1) % CONTENT_WIDTH_CYCLE.length];
}
