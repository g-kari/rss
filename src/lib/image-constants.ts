/**
 * 画像の最小寸法閾値（px）。
 * この値未満の画像はサムネイル・アイコン・トラッキングピクセル等とみなしてフィルタする。
 * html-image-processors.ts (removeSmallThumbnailImages) と
 * useImageDownload.ts (fetchOne) で共有される。
 *
 * **注意**: OGP サムネイル表示用の判定閾値は別概念で、
 * `src/components/article-view/ArticleContentBody.tsx#OG_THUMBNAIL_MIN_WIDTH` (200px) で
 * 独立に定義されている。本定数はフィード本文中の画像 (small thumbnail / icon フィルタ用)、
 * OG_THUMBNAIL_MIN_WIDTH は OGP 画像の「小サムネ→中央配置」UI 切替用で責務が異なるため
 * 統合せず別ファイルで管理する。
 */
export const IMAGE_MIN_DIMENSION = 100;
