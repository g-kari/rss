import type { CompiledKeywordFilter } from "./keyword-filter";

/**
 * `useFilteredArticles` 内で使われる構造的等価判定純粋関数群 (perf F2)。
 *
 * 5 分ポーリング等で `feeds` reference が変わるたびに各種 Map (`digestLimitMap` /
 * `feedCategoryMap` / `feedTitleByHash` / `compiledFilterMap`) が新規生成されるが
 * 内容は変化していないケースが大半を占める。setState ガード経由で旧 reference を
 * 保持して下流 `filtered` useMemo の O(n log n) 再 sort を回避する目的で利用する。
 *
 * canonical pattern: `src/lib/unread-stats-merge.ts` (`equalUnreadByFeed` 等)
 * `src/lib/read-state-merge.ts#equalSnoozedUntil` と同 pattern。
 */

/**
 * `Map<string, V>` の構造的等価判定 generic helper。
 *
 * 値は `===` で比較するので `V` は primitive (`number` / `string`) または
 * 同一性が外部で保証された参照型 (例: `CompiledKeywordFilter` は `buildFilterMap` の
 * `compiledCache` で同一フィルター内容に対して同 reference を返す前提) に限る。
 *
 * 引数は `ReadonlyMap` を受けるので `Map` / `ReadonlyMap` どちらの caller からも
 * 呼べる (`unread-stats-merge.ts` の `equalUnreadByFeed` 等が `ReadonlyMap` 前提)。
 */
export function equalMap<V>(a: ReadonlyMap<string, V>, b: ReadonlyMap<string, V>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    if (b.get(key) !== val) return false;
  }
  return true;
}

/** `Map<string, number>` の構造的等価判定 (digestLimitMap 用) */
export function equalDigestLimitMap(a: Map<string, number>, b: Map<string, number>): boolean {
  return equalMap(a, b);
}

/**
 * `Map<string, string>` の構造的等価判定。
 *
 * `feedCategoryMap` / `feedTitleByHash` 等、5 分ポーリングで `feeds` reference が
 * 変わるたびに rebuild されるが内容自体は通常変化しない Map に適用する。
 */
export function equalStringMap(a: Map<string, string>, b: Map<string, string>): boolean {
  return equalMap(a, b);
}

/**
 * `Map<string, CompiledKeywordFilter>` の構造的等価判定。
 *
 * `buildFilterMap` は `compiledCache` 経由で同一フィルター内容に対して同じ
 * `CompiledKeywordFilter` reference を返すため、値は reference 比較で十分。
 * 5 分ポーリングで `feeds` reference が変わっても、フィルター設定が変化していなければ
 * 旧 Map reference を維持して `structuralFiltered` の O(n) 再フィルタを回避する。
 */
export function equalCompiledFilterMap(
  a: Map<string, CompiledKeywordFilter>,
  b: Map<string, CompiledKeywordFilter>,
): boolean {
  return equalMap(a, b);
}

/**
 * `Set<string>` の構造的等価判定。
 *
 * R2 同期レスポンス受信時に `useReadStateSyncApply` で `computeMergedSet` が新 Set を
 * 返した場合でも、実際の内容が前回 state と同じなら identity を安定化して
 * `useArticleListItemProps.resolveItemProps` の不要 re-render を防ぐ。
 */
export function equalStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * `Set<string> | undefined` の構造的等価判定 (viewFeedIds 用)。
 *
 * `activeFeedView` が変化しない限り viewFeedIds の内容は変化しないが、
 * feeds の reference 変化 (5 分ポーリング) で useMemo が毎回新規 Set を生成する。
 * stable ref ガード経由で reference を安定化して下流 useMemo の不要再計算を防ぐ。
 */
export function equalViewFeedIds(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}
