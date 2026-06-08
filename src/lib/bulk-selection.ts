/**
 * 記事一括選択の Shift+click 範囲計算純粋関数 (#883 Phase A)。
 *
 * - anchor: 直前に通常 click された記事 ID (なければ targetId 単独)
 * - target: 現在 Shift+click された記事 ID
 * - 順序付き配列 `orderedIds` 上で anchor と target の間 (両端含む) の ID を返す
 *
 * orderedIds に anchor または target が見つからない場合は target 単独配列を返す
 * (フィルター切替で anchor が消えた / lightbox で対象外 ID 等のフォールバック)。
 */
export function computeBulkSelectionRange(
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): string[] {
  if (orderedIds.length === 0) return [targetId];
  const targetIdx = orderedIds.indexOf(targetId);
  if (targetIdx === -1) return [targetId];
  if (!anchorId || anchorId === targetId) return [targetId];
  const anchorIdx = orderedIds.indexOf(anchorId);
  if (anchorIdx === -1) return [targetId];
  const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
  return orderedIds.slice(start, end + 1);
}

/**
 * 既存 Set に Shift+click 範囲を **追加** した新 Set を返す純粋関数。
 *
 * 同じ Shift+click を繰り返した場合に同じ range が再度追加されるが結果 Set は同一。
 * 重複 ID は Set の特性で自動排除される。
 */
export function addRangeToSelection(
  current: ReadonlySet<string>,
  rangeIds: readonly string[],
): Set<string> {
  const next = new Set(current);
  for (const id of rangeIds) next.add(id);
  return next;
}
