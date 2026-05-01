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

// ===== ギャラリーカードサイズ =====

export type GalleryCardSize = "small" | "medium" | "large" | "xlarge";

export const GALLERY_CARD_SIZE_CYCLE: GalleryCardSize[] = ["small", "medium", "large", "xlarge"];

const GALLERY_CARD_SIZE_VALUES: Record<GalleryCardSize, number> = {
  small: 160,
  medium: 220,
  large: 300,
  xlarge: 400,
};

export const GALLERY_CARD_SIZE_LABELS: Record<GalleryCardSize, string> = {
  small: "S",
  medium: "M",
  large: "L",
  xlarge: "XL",
};

export function getGalleryCardWidth(size: GalleryCardSize): number {
  return GALLERY_CARD_SIZE_VALUES[size];
}

// ===== ギャラリー最小画像サイズフィルター =====

export type GalleryMinImageFilter = "off" | "small" | "medium" | "large";

export const GALLERY_MIN_IMAGE_FILTER_CYCLE: GalleryMinImageFilter[] = [
  "off",
  "small",
  "medium",
  "large",
];

const GALLERY_MIN_IMAGE_FILTER_VALUES: Record<GalleryMinImageFilter, number> = {
  off: 0,
  small: 50,
  medium: 100,
  large: 200,
};

export const GALLERY_MIN_IMAGE_FILTER_LABELS: Record<GalleryMinImageFilter, string> = {
  off: "なし",
  small: "50px",
  medium: "100px",
  large: "200px",
};

export function getGalleryMinImagePx(filter: GalleryMinImageFilter): number {
  return GALLERY_MIN_IMAGE_FILTER_VALUES[filter];
}
