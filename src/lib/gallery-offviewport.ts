/**
 * 「viewport より下にある item のみ再配置する」設計のための純粋関数群。
 *
 * 設計方針 (ユーザー判断「案 A + 画面領域外のみ適応」):
 * - 画像 load で item の actual height 判明
 * - viewport 内 (visible) の item は touch しない (ちらつき防止)
 * - viewport 外 (off-screen) の item のみ再配置
 *
 * 現状 production caller 0 件 (masonic 完全削除済、自前 virtualizer (GalleryMasonrySelf)
 * への UI 統合は未実施)。削除判断は別 Issue で議論中。
 */

/**
 * item が viewport 外 (= 画面下に隠れた範囲) にあるか判定。
 *
 * @param itemIndex - 判定対象の item index
 * @param lastVisibleIndex - 現在 viewport 内に見えている最後の item index
 *                           (-1 = viewport 内に item なし / すべて scroll で隠れた状態)
 * @returns true なら viewport 外 (= 再配置 OK), false なら viewport 内 (= 触らない)
 */
export function isOffViewport(itemIndex: number, lastVisibleIndex: number): boolean {
  return itemIndex > lastVisibleIndex;
}

/**
 * 配置情報から「現在 viewport 内に見えている最後の item index」を計算。
 *
 * 「item の top が viewport bottom より上にある」item のうち最大の index を返す。
 * positions が index 昇順でない (= masonry layout は shortest column 優先で順不同に配置)
 * ケースにも対応。
 *
 * @param positions - 各 item の配置情報配列
 * @param scrollTop - スクロール量 (px、scroll コンテナの scrollTop)
 * @param viewportHeight - viewport 高さ (px、scroll コンテナの clientHeight)
 * @returns viewport 内の最大 index (-1 = viewport 内 item なし)
 */
export function computeLastVisibleIndex(
  positions: ReadonlyArray<{ index: number; top: number }>,
  scrollTop: number,
  viewportHeight: number,
): number {
  const viewportBottom = scrollTop + viewportHeight;
  let result = -1;
  for (const p of positions) {
    if (p.top < viewportBottom && p.index > result) {
      result = p.index;
    }
  }
  return result;
}

/**
 * item 配列を viewport 内 / 外で 2 つに分割する純粋関数。
 *
 * @param items - 分割対象の配列
 * @param getIndex - 各 item から masonic index を取得するアクセサ
 * @param lastVisibleIndex - `computeLastVisibleIndex` の戻り値
 * @returns inside (viewport 内) と outside (viewport 外) の配列ペア。input は mutate されない
 */
export function partitionByViewport<T>(
  items: ReadonlyArray<T>,
  getIndex: (item: T) => number,
  lastVisibleIndex: number,
): { inside: T[]; outside: T[] } {
  const inside: T[] = [];
  const outside: T[] = [];
  for (const item of items) {
    if (isOffViewport(getIndex(item), lastVisibleIndex)) outside.push(item);
    else inside.push(item);
  }
  return { inside, outside };
}
