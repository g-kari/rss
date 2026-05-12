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

export type GalleryColumns = "auto" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export const GALLERY_COLUMNS_CYCLE: GalleryColumns[] = [
  "auto",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
];

export const GALLERY_COLUMNS_LABELS: Record<GalleryColumns, string> = {
  auto: "自動",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
};

/**
 * フォーカスモード時のギャラリー列数ラベル (#666)。
 * `auto` は「通常列数と同じに追従」を意味する。
 */
export const GALLERY_COLUMNS_FOCUS_LABELS: Record<GalleryColumns, string> = {
  auto: "通常と同じ",
  "1": "1",
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

export const GALLERY_MIN_IMAGE_PX_MIN = 0;
export const GALLERY_MIN_IMAGE_PX_MAX = 500;
export const GALLERY_MIN_IMAGE_PX_STEP = 10;
export const GALLERY_MIN_IMAGE_PX_DEFAULT = 0;

// ===== ギャラリー 1 ページの記事件数 (#714 関連) =====
// useArticlePagination の chunk サイズ。ユーザーが scroll で `loadMore` する度に
// `+pageSize` 件 visible に追加される。gallery layout で多数のサムネを一度に表示
// したいケースのため設定可能化。
// 「ギャラリー」と命名しているが現実装では全 layout に同じ値を適用する (UI 設計の
// 簡潔さ優先、必要なら将来 layout 別に分離可能)。

export type GalleryPageSize = 10 | 20 | 30 | 40 | 50 | 100 | 200 | 500;

export const GALLERY_PAGE_SIZE_CYCLE: readonly GalleryPageSize[] = [
  10, 20, 30, 40, 50, 100, 200, 500,
] as const;

export const GALLERY_PAGE_SIZE_DEFAULT: GalleryPageSize = 50;

export const GALLERY_PAGE_SIZE_LABELS: Record<GalleryPageSize, string> = {
  10: "10 件",
  20: "20 件",
  30: "30 件",
  40: "40 件",
  50: "50 件",
  100: "100 件",
  200: "200 件",
  500: "500 件",
};

/** 不正値 / null → デフォルトに fallback する parser */
export function parseGalleryPageSize(raw: string | null): GalleryPageSize {
  if (!raw) return GALLERY_PAGE_SIZE_DEFAULT;
  const n = Number(raw);
  if (GALLERY_PAGE_SIZE_CYCLE.includes(n as GalleryPageSize)) {
    return n as GalleryPageSize;
  }
  return GALLERY_PAGE_SIZE_DEFAULT;
}
