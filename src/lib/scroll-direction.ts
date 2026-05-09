/**
 * スクロール方向判定の純粋関数 (#677)。
 *
 * スクロール量がしきい値未満の微小変化はノイズとして無視 ("same" を返す)。
 * 「上スクロールでヘッダー表示・下スクロールで隠す」UI のための基盤。
 */

export type ScrollDirection = "up" | "down" | "same";

/**
 * 前回 scrollTop と現在 scrollTop からスクロール方向を判定する。
 *
 * - 差が `threshold` (px) 未満 → "same" (微小揺れを無視)
 * - 現在 > 前回 → "down"
 * - 現在 < 前回 → "up"
 */
export function computeScrollDirection(
  prevTop: number,
  currentTop: number,
  threshold: number = 4,
): ScrollDirection {
  const delta = currentTop - prevTop;
  if (delta === 0) return "same";
  if (Math.abs(delta) < threshold) return "same";
  return delta > 0 ? "down" : "up";
}

/**
 * スクロール状態からヘッダー表示可否を判定する純粋関数。
 *
 * - スクロール位置が **viewport 上端付近** (例: scrollTop < topThreshold) なら常に表示
 *   (ページ最上部ではユーザーが「これから読む準備」をしているため)
 * - 上スクロール → 表示
 * - 下スクロール → 隠す
 * - 微小揺れ ("same") → 前の状態維持 (引数 prevVisible)
 */
export interface HeaderVisibilityInput {
  /** 直前の表示状態 (微小揺れ時の継続用) */
  prevVisible: boolean;
  /** computeScrollDirection の結果 */
  direction: ScrollDirection;
  /** 現在の scrollTop */
  scrollTop: number;
  /** scrollTop がこの px 未満なら常に表示 (デフォルト 80px) */
  topThreshold?: number;
}

export function computeHeaderVisibility(input: HeaderVisibilityInput): boolean {
  const { prevVisible, direction, scrollTop, topThreshold = 80 } = input;
  if (scrollTop < topThreshold) return true; // 上端付近は常に表示
  if (direction === "up") return true;
  if (direction === "down") return false;
  return prevVisible;
}
