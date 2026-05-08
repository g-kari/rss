/**
 * インラインナビ領域のクリック位置から「前 / 次」の方向を判定する純粋関数。
 *
 * - PC でドラッグなしクリック時に、要素の中央より左を押したか右を押したかで
 *   onSelectPrev / onSelectNext を呼び分けるために使う。
 */
export function whichSideClicked(
  clickX: number,
  rect: { left: number; right: number },
): "left" | "right" {
  const center = (rect.left + rect.right) / 2;
  return clickX < center ? "left" : "right";
}
