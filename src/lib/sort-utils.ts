/**
 * 並び順 (`order: number` フィールド) を持つ配列の安定ソートユーティリティ。
 *
 * `useFeedGroups` / `useCollections` 等の「order を持つ R2 永続データ」の
 * 並び替えロジックが各 hook で重複していたため共通化。
 *
 * 元の配列を mutate せず新しい配列を返す (sort は in-place なので spread が必須)。
 */

import type { Collection, CollectionSortBy } from "../types";

interface HasOrder {
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

/**
 * 既存配列の `order` 最大値 + 1 を返す純粋関数。
 *
 * 新規 entity 追加時に使う「次の order 値」算出ロジックの集約。
 * 空配列なら 0 を返す (`max(-1, ...) + 1`)。
 */
export function computeNextOrder<T extends HasOrder>(items: readonly T[]): number {
  return items.reduce((max, item) => Math.max(max, item.order), -1) + 1;
}

/**
 * コレクションを指定の sort 軸で並び替える純粋関数 (`#874` 候補 1)。
 *
 * - `order`: ユーザー手動並び順 (デフォルト、`sortByOrder` と同等)
 * - `createdAtDesc`: 作成日時 新→旧 (ISO 8601 absolute 時刻ベース、tz 形式違いに耐性)
 * - `articleCountDesc`: 記事数 多→少 (同数は order 昇順 fallback)
 * - `nameAsc`: 名前 a-z (localeCompare で日本語含む正しい辞書順)
 * - `nameDesc`: 名前 z-a (`nameAsc` と同じ照合規則の逆順)
 *
 * 元の配列を mutate せず新しい配列を返す。
 */
export function sortCollectionsBy(
  collections: readonly Collection[],
  sortBy: CollectionSortBy,
): Collection[] {
  const list = [...collections];
  switch (sortBy) {
    case "createdAtDesc":
      return list.sort((a, b) => {
        const ta = Date.parse(a.createdAt);
        const tb = Date.parse(b.createdAt);
        if (isNaN(ta) && isNaN(tb)) return a.order - b.order;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return tb - ta;
      });
    case "articleCountDesc":
      return list.sort((a, b) => {
        const diff = b.articleIds.length - a.articleIds.length;
        return diff !== 0 ? diff : a.order - b.order;
      });
    case "nameAsc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "nameDesc":
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case "order":
    default:
      return sortByOrder(list);
  }
}

/** コレクション sort 軸の cycle 順序 (UI ボタン押下で順次切替) */
export const COLLECTION_SORT_BY_CYCLE: CollectionSortBy[] = [
  "order",
  "createdAtDesc",
  "articleCountDesc",
  "nameAsc",
  "nameDesc",
];

/** コレクション sort 軸の表示ラベル */
export const COLLECTION_SORT_BY_LABELS: Record<CollectionSortBy, string> = {
  order: "手動並び順",
  createdAtDesc: "作成日新→旧",
  articleCountDesc: "記事数多→少",
  nameAsc: "名前 a-z",
  nameDesc: "名前 z-a",
};
