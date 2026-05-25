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

/**
 * `GalleryArticleItem` の描画モード分類 (#819)。
 *
 * 元実装 (`GalleryItem.tsx:130-243`) に存在した 4-5 段三項 chain を
 * `selectGalleryDisplayMode` 純粋関数で平坦化したもの。各モードに対応する
 * JSX は consumer 側で `switch (mode)` の 1 段分岐で扱う。
 *
 * mode 一覧 (優先順位高→低):
 *   1. `forced-hidden`        — forcedImageSrc 指定 + minPx フィルタで全画像 hidden
 *                                (1 記事 N 画像分解時、カード自体を非表示)
 *   2. `failed-with-thumb`    — isFetchFailed + thumb あり (OGP/サムネ背景 + エラー UI overlay)
 *   3. `failed-no-thumb`      — isFetchFailed + thumb なし (エラー UI のみ)
 *   4. `fallback-thumb`       — prefetched 全画像 hidden + thumb fallback (#671 主シナリオ)
 *   5. `fallback-no-image`    — prefetched 全画像 hidden + thumb なし (No image プレースホルダ)
 *   6. `gallery`              — 通常 (prefetched / thumb / forcedImageSrc) 描画
 *   7. `none`                 — source=none + retry overlay (No image プレースホルダ)
 */
export type GalleryDisplayMode =
  | "failed-with-thumb"
  | "failed-no-thumb"
  | "forced-hidden"
  | "fallback-thumb"
  | "fallback-no-image"
  | "gallery"
  | "none";

/**
 * `GalleryArticleItem` の描画モードを決定する純粋関数 (#819)。
 *
 * 元実装 (`GalleryItem.tsx`) の三項 chain と完全互換の優先順位を保つ:
 *   isFetchFailed → (forcedImageSrc + allFiltered) → fallbackToThumb → fallbackToNoImage
 *   → imageSource !== "none" → none
 *
 * 注意: `isForcedHidden = !!forcedImageSrc && allFiltered` は元コードで
 * 三項 chain の手前で early return される (return <div hidden />) ため、
 * mode としては最優先に位置するが、`isFetchFailed` より厳密には先に評価される。
 * 但し `isFetchFailed` と `isForcedHidden` が同時に true になる経路は
 * 元コードに存在しない (forcedImageSrc 指定 = 画像/動画 view、isFetchFailed =
 * prefetch 失敗で発火する条件が排他的)。本関数では元コードの evaluation 順序
 * (isFetchFailed → isForcedHidden の順) をそのまま保存する。
 */
export function selectGalleryDisplayMode(args: {
  isFetchFailed: boolean;
  isForcedHidden: boolean;
  fallbackToThumb: boolean;
  fallbackToNoImage: boolean;
  imageSource: GalleryImageSource;
  thumb: string | null | undefined;
}): GalleryDisplayMode {
  const { isFetchFailed, isForcedHidden, fallbackToThumb, fallbackToNoImage, imageSource, thumb } =
    args;
  // 元コード: `if (isForcedHidden) return <div hidden />` は三項 chain の **手前** で
  // early return されるが、isFetchFailed と isForcedHidden が同時に true になる
  // 経路は元コードに存在しないため、本関数は元コードの JSX 評価順 (isFetchFailed 先)
  // を保存する。但し forced-hidden 優先の意図を残すため、isForcedHidden true なら
  // まずそれを返す (元コードの early return 挙動と整合)。
  if (isForcedHidden) return "forced-hidden";
  if (isFetchFailed) {
    return thumb ? "failed-with-thumb" : "failed-no-thumb";
  }
  if (fallbackToThumb) return "fallback-thumb";
  if (fallbackToNoImage) return "fallback-no-image";
  if (imageSource !== "none") return "gallery";
  return "none";
}
