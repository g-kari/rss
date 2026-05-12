/**
 * 未読統計 Map の structural equality 判定純粋関数 (#758)。
 *
 * `useArticleUnreadStats` の `unreadByFeed` / `lastPublishedByFeed` は articles /
 * readIds が変化するたびに新 Map インスタンスを作成する。内容が同じでも reference 変化で
 * 下流の `useMemo` や Provider value が更新され、subscriber (FeedSidebar / 内部
 * CategorySection / FeedGroupsSection) の不要 re-render を誘発する。
 *
 * これを防ぐため `useRef` 経由で前回 Map と内容比較し、一致時は前回 reference を返す
 * 構造的等価性ガード (`react-state-ref.md` の規範) を導入する。本ファイルはその比較関数を
 * pure として切り出して TDD 可能にする。
 *
 * `read-state-merge.ts#equalSnoozedUntil` と同パターン。
 */

/**
 * `Map<string, number>` の structural equality 判定 (`unreadByFeed` 用)。
 * - 同 reference: true
 * - 同 size + 全 key/value 一致: true
 * - 上記以外: false
 *
 * 計算量 O(N) (N = Map size)。本プロジェクトの subscription 上限 100 件想定で < 1ms。
 */
export function equalUnreadByFeed(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (!b.has(key)) return false;
    if (b.get(key) !== value) return false;
  }
  return true;
}

/**
 * `Map<string, string>` の structural equality 判定 (`lastPublishedByFeed` 用)。
 * 値が ISO 8601 文字列なので `===` 比較で十分。
 */
export function equalLastPublishedByFeed(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (!b.has(key)) return false;
    if (b.get(key) !== value) return false;
  }
  return true;
}
