/**
 * ギャラリービュー描画用の画像ソース選択純粋関数。
 *
 * 優先順位 (高→低):
 *   1. prefetched (記事本文から抽出した画像)
 *   2. thumb (OGP / article.ogImage / YouTube サムネ)
 *   3. なし → 空配列
 *
 * 「本文画像が一枚もない場合はサムネ/OGP を表示」(#671) を明示化するため、
 * UI 分岐ではなく純粋関数で表現してテスト可能にする。
 */

export type GalleryImageSource = "prefetched" | "thumb" | "none";

export interface GalleryImageSelection {
  /** 描画対象の画像 URL 配列。空配列なら「No image」プレースホルダ表示 */
  images: string[];
  /** どのソースから採用したか (UI 分岐・テレメトリ・min-px フィルター適用判定に使用) */
  source: GalleryImageSource;
}

/**
 * ギャラリーアイテムに描画する画像配列を決定する。
 *
 * - prefetched に 1 件以上あればそれを採用 (本文画像優先)
 * - prefetched が空配列または undefined で thumb があれば、thumb を単一画像として採用
 * - 両方なければ空配列 (呼び出し側で「No image」プレースホルダを描画)
 *
 * `source` を返すことで、呼び出し側は:
 * - `"prefetched"`: 本文画像 → minPx フィルターを適用
 * - `"thumb"`: OGP fallback → minPx フィルターをバイパス (常に表示)
 * - `"none"`: 画像なし → プレースホルダ
 * の 3 分岐を厳密に判定できる。
 */
export function selectGalleryImages(
  prefetchedImages: string[] | undefined,
  thumb: string | null | undefined,
): GalleryImageSelection {
  if (prefetchedImages && prefetchedImages.length > 0) {
    return { images: prefetchedImages, source: "prefetched" };
  }
  if (thumb) {
    return { images: [thumb], source: "thumb" };
  }
  return { images: [], source: "none" };
}
