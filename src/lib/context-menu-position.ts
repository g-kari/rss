import type { CSSProperties } from "react";

/**
 * Context menu / popup の viewport-aware ポジショニング純粋関数。
 *
 * ArticleContextMenu / GalleryContextMenu / FeedItemComponent の 3 箇所で重複していた
 * inline IIFE を集約 (refactor agent 監査 #cycle で発見、信頼度 85%)。
 *
 * - 右端マージン 4px を確保するため `left = min(x, viewport.w - minWidth - 4)` でクランプ
 * - 左端マージン 4px を確保するため `left = max(4, left)` で下限ガード
 * - 下スペース (`viewport.h - y`) が estimatedHeight 以上なら top アンカー、
 *   不足なら bottom アンカー (`viewport.h - y` を下端からのオフセットに)
 *
 * viewport 寸法は引数で受けるか、未指定なら `window.innerWidth` / `window.innerHeight` から取得。
 *
 * 注: FeedItemComponent の `menuBtnRect` ベース分岐 (anchor が button bounding rect) は
 * algorithm が異なるため本 helper の対象外 (rightPos 計算で右寄せ)。
 */
export function computeContextMenuPosition(
  x: number,
  y: number,
  minWidth: number,
  estimatedHeight: number,
  viewportWidth: number = typeof window !== "undefined" ? window.innerWidth : 0,
  viewportHeight: number = typeof window !== "undefined" ? window.innerHeight : 0,
): CSSProperties {
  const left = Math.min(x, viewportWidth - minWidth - 4);
  const spaceBelow = viewportHeight - y;
  if (spaceBelow >= estimatedHeight) {
    return { top: y, left: Math.max(4, left) };
  }
  return { bottom: viewportHeight - y, left: Math.max(4, left) };
}
