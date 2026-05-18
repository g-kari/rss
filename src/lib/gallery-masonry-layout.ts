/**
 * #773 Phase 0 + Phase 1: 自前 masonry layout の基盤型と純粋関数。
 *
 * `masonic` ライブラリの絶対配置 + 画像 load completion 時の aspectRatio 変化で
 * scroll position が巻き戻る問題 (#773) を完全解決するため、masonic を廃止して
 * 自前 virtualizer 独自実装に移行する。
 *
 * Phase 0 (commit `39325d95`):
 * - 型抽象化 (`MasonryLayoutItem` / `MasonryLayoutResult`)
 * - 列ごとの累積高さ計算 (`computeColumnHeights`)
 * - 最短列選択 (`assignItemToShortestColumn`)
 *
 * Phase 1 (本ファイル):
 * - 完全な layout 計算 (`computeMasonryLayout` → positions Map + columnHeights)
 * - scroll anchor 補正アルゴリズム (`computeScrollAnchorDelta` → 本 Issue 完全解決の核)
 *
 * Phase 2 (次サイクル以降):
 * - `GalleryMasonry.tsx` 置換 + `useMasonryLayout.ts` hook
 */

/**
 * masonry layout で扱う最小単位の item。
 *
 * `id` は React key / Map key として使用。`width` / `height` は配置時の高さ計算に使う
 * (本 Phase 0 では `height` のみ参照、`width` は Phase 1 で aspectRatio 計算に使用予定)。
 */
export interface MasonryLayoutItem {
  /** item の識別子 (React key + position map のキー) */
  id: string;
  /** item の幅 (px) — Phase 1 で aspectRatio / column-fit 計算に使用 */
  width: number;
  /** item の高さ (px) — 列累積高さに加算される値 */
  height: number;
}

/**
 * masonry layout の計算結果。
 *
 * - `positions`: 各 item の配置先列と top 座標 (px)
 * - `columnHeights`: 各列の最終的な累積高さ (px、gap 込み)
 *
 * Phase 1 で `computeMasonryLayout` がこの型を返す。Phase 0 では interface 定義のみ。
 */
export interface MasonryLayoutResult {
  positions: Map<string, { col: number; top: number }>;
  columnHeights: number[];
}

/**
 * 列ごとの最終的な累積高さを計算する純粋関数。
 *
 * 各 item を **最短列** に順次配置 (tie の場合は最小 index 列)、その列の累積高さに
 * `item.height` を加算する。2 番目以降の item は `gap` も加算する (列内 item 間の隙間)。
 *
 * @param items 配置対象 item 配列 (配置順序通り)
 * @param columnCount 列数 (≥ 1)
 * @param gap 列内 item 間の隙間 (px、デフォルト 0)
 * @returns 各列の最終累積高さ配列 (長さ = columnCount)
 *
 * @example
 * computeColumnHeights([{id:"a", width:100, height:100}], 1) // [100]
 * computeColumnHeights([{id:"a", width:100, height:100}, {id:"b", width:100, height:200}], 2)
 * // [100, 200]  ← a を col 0、b を col 1 (tie 時最小 index) に配置
 */
export function computeColumnHeights(
  items: ReadonlyArray<MasonryLayoutItem>,
  columnCount: number,
  gap: number = 0,
): number[] {
  if (columnCount < 1) return [];
  const columnHeights = new Array<number>(columnCount).fill(0);
  for (const item of items) {
    const targetCol = assignItemToShortestColumn(columnHeights);
    const isFirstInColumn = columnHeights[targetCol] === 0;
    columnHeights[targetCol] =
      columnHeights[targetCol]! + item.height + (isFirstInColumn ? 0 : gap);
  }
  return columnHeights;
}

/**
 * 現在の列ごとの累積高さ配列から、次の item を配置すべき **最短列の index** を返す純粋関数。
 *
 * tie (複数列が同じ最短高さ) の場合は最小 index を返す。これにより配置が決定論的になり、
 * spec で挙動を固定できる + 同 items / 同 columnCount で常に同じレイアウトが得られる。
 *
 * @param columnHeights 各列の現在の累積高さ配列
 * @returns 最短列の index (0 始まり、columnHeights が空配列なら 0)
 *
 * @example
 * assignItemToShortestColumn([100, 200, 150]) // 0 (最小高さ)
 * assignItemToShortestColumn([100, 100, 200]) // 0 (tie 時最小 index)
 * assignItemToShortestColumn([])              // 0 (defensive)
 */
export function assignItemToShortestColumn(columnHeights: ReadonlyArray<number>): number {
  if (columnHeights.length === 0) return 0;
  let minIndex = 0;
  let minHeight = columnHeights[0]!;
  for (let i = 1; i < columnHeights.length; i++) {
    if (columnHeights[i]! < minHeight) {
      minIndex = i;
      minHeight = columnHeights[i]!;
    }
  }
  return minIndex;
}

/**
 * 各 item の配置先列と top 座標を含む完全な masonry layout を計算する純粋関数。
 *
 * `computeColumnHeights` と同じ最短列配置ロジックで、追加で各 item の id をキーとした
 * positions Map を返す。Phase 2 で `<GalleryMasonry>` がこの結果を使って
 * `<div style={{ position: absolute, left: col * columnWidth, top }}>` で配置する。
 *
 * @param items 配置対象 item 配列 (配置順序通り)
 * @param columnCount 列数 (≥ 1)
 * @param gap 列内 item 間の隙間 (px、デフォルト 0)
 * @returns `MasonryLayoutResult { positions, columnHeights }`
 *
 * @example
 * const layout = computeMasonryLayout(
 *   [{id:"a", width:100, height:100}, {id:"b", width:100, height:200}],
 *   2,
 * );
 * layout.positions.get("a") // { col: 0, top: 0 }
 * layout.positions.get("b") // { col: 1, top: 0 }
 * layout.columnHeights      // [100, 200]
 */
export function computeMasonryLayout(
  items: ReadonlyArray<MasonryLayoutItem>,
  columnCount: number,
  gap: number = 0,
): MasonryLayoutResult {
  if (columnCount < 1) return { positions: new Map(), columnHeights: [] };
  const columnHeights = new Array<number>(columnCount).fill(0);
  const positions = new Map<string, { col: number; top: number }>();
  for (const item of items) {
    const targetCol = assignItemToShortestColumn(columnHeights);
    const isFirstInColumn = columnHeights[targetCol] === 0;
    const top = columnHeights[targetCol]! + (isFirstInColumn ? 0 : gap);
    positions.set(item.id, { col: targetCol, top });
    columnHeights[targetCol] = top + item.height;
  }
  return { positions, columnHeights };
}

/**
 * 画像 load 完了などで item の高さが変化したとき、scroll position が「巻き戻る」
 * 現象 (#773 の真因) を防ぐための **scrollTop 補正量** を計算する純粋関数。
 *
 * アルゴリズム:
 * 1. **viewport より上にあった item** (`prev.top < viewportTop`) のみ補正対象
 *    - viewport 内 item の変化は補正しない (それが「巻き戻り」の主因 → 補正で打ち消すと逆効果)
 *    - viewport 外の item は scroll に影響しないため不要
 * 2. 各 item で `next.top - prev.top` を加算 (= 高さ変化が下流にもたらした top の変化分)
 * 3. 合計 delta を返す → 呼出側で `scrollContainer.scrollTop += delta` を実行
 *
 * これにより viewport 上で aspectRatio が変化しても、ユーザーが見ている viewport 内
 * item の位置は scrollTop 補正で維持される (= 巻き戻りゼロ)。
 *
 * 補正対象外:
 * - `next` に存在しない item (= 削除済) は skip
 * - `prev` にしか存在しない item (= 削除) も skip (viewport 内 item の補正は別途必要だが
 *   本 Issue では aspectRatio 変化に限定するため非対応)
 *
 * @param prevPositions 変化前の positions Map
 * @param nextPositions 変化後の positions Map
 * @param viewportTop scroll コンテナの現在の scrollTop
 * @returns scrollTop に加算すべき補正量 (px、正なら下方向、負なら上方向)
 *
 * @example
 * // viewport 上の item が aspectRatio 変化で下にずれた
 * const prev = new Map([["a", { col: 0, top: 0 }], ["b", { col: 0, top: 100 }]]);
 * const next = new Map([["a", { col: 0, top: 0 }], ["b", { col: 0, top: 150 }]]);
 * computeScrollAnchorDelta(prev, next, 200) // +50 (b は viewport より上 (100 < 200) で +50 ずれた)
 */
export function computeScrollAnchorDelta(
  prevPositions: ReadonlyMap<string, { col: number; top: number }>,
  nextPositions: ReadonlyMap<string, { col: number; top: number }>,
  viewportTop: number,
): number {
  let delta = 0;
  for (const [id, prev] of prevPositions) {
    const next = nextPositions.get(id);
    if (!next) continue; // 削除済 item は補正不要
    // viewport より上にあった item のみ補正対象 (prev.top < viewportTop)
    if (prev.top < viewportTop) {
      delta += next.top - prev.top;
    }
  }
  return delta;
}
