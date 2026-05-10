/**
 * 並び順 (`order: number` フィールド) を持つ配列の安定ソートユーティリティ。
 *
 * `useFeedGroups` / `useCollections` 等の「order を持つ R2 永続データ」の
 * 並び替えロジックが各 hook で重複していたため共通化。
 *
 * 元の配列を mutate せず新しい配列を返す (sort は in-place なので spread が必須)。
 */

export interface HasOrder {
  order: number;
}

/**
 * `order` 昇順でソートした新しい配列を返す。
 *
 * 同 order 値の安定性は `Array.prototype.sort` の仕様 (ES2019+) に従う
 * (V8 / SpiderMonkey / JavaScriptCore はすべて stable sort 実装)。
 */
export function sortByOrder<T extends HasOrder>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}
