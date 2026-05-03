/**
 * 画像の最小寸法閾値（px）。
 * この値未満の画像はサムネイル・アイコン・トラッキングピクセル等とみなしてフィルタする。
 * html-image-processors.ts (removeSmallThumbnailImages) と
 * useImageDownload.ts (fetchOne) で共有される。
 */
export const IMAGE_MIN_DIMENSION = 100;
