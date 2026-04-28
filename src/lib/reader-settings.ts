/**
 * リーダー表示設定ユーティリティ
 *
 * 行間 (5段階) / コンテンツ幅 (4段階) / ギャラリー列数 の
 * 定数・CSS スタイル生成を提供する。
 */

import type { CSSProperties } from "react";

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

// ===== ギャラリー列数 =====

export type GalleryColumns = "auto" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export const GALLERY_COLUMNS_CYCLE: GalleryColumns[] = ["auto", "2", "3", "4", "5", "6", "7", "8"];

export const GALLERY_COLUMNS_LABELS: Record<GalleryColumns, string> = {
  auto: "自動",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
};
