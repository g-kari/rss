/**
 * テキスト選択ポップアップ (SelectionExcludePopup) の viewport-aware ポジショニング純粋関数 (#1089)。
 *
 * 旧実装は `{ left: 選択中央, top: 選択上端 }` + CSS `-translate-x-1/2 -translate-y-full` で
 * 選択の上に中央配置していたため、選択が viewport の左右端 / 上端にあると popup が領域外に
 * はみ出していた。本関数は popup の実測サイズを受けて:
 *   - 水平方向: 選択中央に揃えつつ [margin, viewportWidth - width - margin] にクランプ
 *   - 垂直方向: 上に余白があれば上 (above)、なければ選択の下 (below) にフリップ
 * した top-left 座標を返す。
 */

export type SelectionPopupPlacement = "above" | "below";

export interface SelectionPopupLayout {
  /** popup box の left 座標 (px) */
  left: number;
  /** popup box の top 座標 (px) */
  top: number;
  /** 選択の上に出すか下に出すか (吹き出し三角の向き決定に使う) */
  placement: SelectionPopupPlacement;
}

export interface SelectionPopupLayoutArgs {
  /** 選択範囲の水平中央 (px、viewport 座標) */
  anchorX: number;
  /** 選択範囲の上端 (px、viewport 座標) */
  selectionTop: number;
  /** 選択範囲の下端 (px、viewport 座標) */
  selectionBottom: number;
  /** popup box の実測幅 (px) */
  popupWidth: number;
  /** popup box の実測高さ (px) */
  popupHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** popup と選択範囲の間隔 (px、default 8) */
  gap?: number;
  /** viewport 端からの最小マージン (px、default 8) */
  margin?: number;
}

export function computeSelectionPopupLayout(args: SelectionPopupLayoutArgs): SelectionPopupLayout {
  const gap = args.gap ?? 8;
  const margin = args.margin ?? 8;

  // 水平: 選択中央に揃え、viewport 内にクランプ。
  // popup が viewport より広い場合 (margin*2 + width > vw) は min が max を上回るので margin に固定。
  const maxLeft = args.viewportWidth - args.popupWidth - margin;
  let left = args.anchorX - args.popupWidth / 2;
  left = Math.max(margin, maxLeft >= margin ? Math.min(left, maxLeft) : margin);

  // 垂直: 上に余白があれば above、なければ選択の下 (below) にフリップ。
  const aboveTop = args.selectionTop - args.popupHeight - gap;
  if (aboveTop >= margin) {
    return { left, top: aboveTop, placement: "above" };
  }
  const belowTop = args.selectionBottom + gap;
  const maxTop = args.viewportHeight - args.popupHeight - margin;
  if (belowTop <= maxTop) {
    return { left, top: belowTop, placement: "below" };
  }
  // 上下どちらも収まらない (極端に背の高い popup) → above を viewport 内にクランプして表示継続。
  return { left, top: Math.max(margin, Math.min(aboveTop, maxTop)), placement: "above" };
}
