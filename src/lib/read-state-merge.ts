import type { KeywordFilter, ReadState } from "../types";

/** POST /api/read-state で送信する削除差分 */
export interface ReadStateRemovedIds {
  readIds?: string[];
  bookmarkIds?: string[];
  readingListIds?: string[];
  likeIds?: string[];
  /** tagIds マップから完全に削除する articleId 配列 */
  tagIds?: string[];
}

/** POST /api/read-state の入力型（追加分 + 削除差分） */
export interface ReadStateUpdate extends Partial<ReadState> {
  removedIds?: ReadStateRemovedIds;
}

function mergeIdList(
  existing: readonly string[] | undefined,
  incoming: readonly string[] | undefined,
  removed: readonly string[] | undefined,
): string[] {
  const ex = existing ?? [];
  const inc = incoming ?? [];
  const rem = removed ?? [];

  if (!rem.length && !inc.length) return [...ex];

  if (!rem.length) {
    const seen = new Set(ex);
    const result = [...ex];
    for (const id of inc) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    return result;
  }

  const removedSet = new Set(rem);
  const result = new Set<string>();
  for (const id of ex) if (!removedSet.has(id)) result.add(id);
  for (const id of inc) if (!removedSet.has(id)) result.add(id);
  return [...result];
}

function mergeSnoozed(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string> | null | undefined,
): Record<string, string> | null {
  const merged: Record<string, string> = { ...(existing ?? {}) };
  for (const [id, until] of Object.entries(incoming ?? {})) {
    const prev = merged[id];
    if (!prev || until > prev) merged[id] = until;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function mergeNotes(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string> | null | undefined,
): Record<string, string> | null {
  const merged: Record<string, string> = { ...(existing ?? {}), ...(incoming ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

/** マージ結果に保持する記事タグのハードリミット（R2 レコード肥大化防止） */
const MAX_TAGGED_ARTICLES_STORED = 5_000;

/**
 * tagIds のマージ。
 * - incoming のキーは incoming を採用（クライアント最終状態で上書き）
 * - removedKeys に含まれるキーは結果から除去
 * - それ以外のキーは existing を保持
 * - 合計件数が MAX_TAGGED_ARTICLES_STORED を超える場合は古いキーから切り詰める
 *   （Record のキー挿入順を利用して、既存の頭から落とす）
 * 各記事のタグは「そのクライアントでのタグ全体」を想定し、キーごと完全置換する方針。
 */
function mergeTags(
  existing: Record<string, string[]> | null | undefined,
  incoming: Record<string, string[]> | null | undefined,
  removedKeys: readonly string[] | undefined,
): Record<string, string[]> | null {
  const removedSet = new Set(removedKeys ?? []);
  const merged: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (removedSet.has(k)) continue;
    merged[k] = v;
  }
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (removedSet.has(k)) continue;
    merged[k] = v;
  }
  const keys = Object.keys(merged);
  if (keys.length > MAX_TAGGED_ARTICLES_STORED) {
    const toDrop = keys.length - MAX_TAGGED_ARTICLES_STORED;
    for (let i = 0; i < toDrop; i++) delete merged[keys[i]!];
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function chooseLater(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return a > b ? a : b;
}

/**
 * サーバー側 POST /api/read-state のマージ処理。
 * 既存 ReadState と update (追加 + 削除差分) を 3-way でマージして返す。
 *
 * - readIds / bookmarkIds / readingListIds / likeIds: (existing ∪ update) \ removed
 *   → 他端末の追加を失わず、明示的な削除は伝播する
 * - globalFilter: update で指定されていれば上書き（明示的 null で解除も可）
 * - readBeforeTimestamp: より遅い方を採用（後退しない）
 * - snoozedUntil: キー単位で until が遅い方を採用
 * - notes: キー単位で update 優先マージ（存在しないキーは既存を保持）
 */
export function mergeReadStateUpdate(
  existing: ReadState,
  update: ReadStateUpdate,
  maxReadIds?: number,
): ReadState {
  const removed = update.removedIds ?? {};
  const readIds = mergeIdList(existing.readIds, update.readIds, removed.readIds);
  const bookmarkIds = mergeIdList(existing.bookmarkIds, update.bookmarkIds, removed.bookmarkIds);
  const readingListIds = mergeIdList(
    existing.readingListIds,
    update.readingListIds,
    removed.readingListIds,
  );
  const likeIds = mergeIdList(existing.likeIds, update.likeIds, removed.likeIds);

  // globalFilter は update にキーが含まれていれば上書き（明示的 null は「フィルター解除」を意味する）
  const globalFilter: KeywordFilter | null =
    "globalFilter" in update ? (update.globalFilter ?? null) : (existing.globalFilter ?? null);

  // ttlDays は update にキーが含まれていれば上書き（明示的 null は「デフォルト TTL に戻す」を意味する）
  const ttlDays: number | null =
    "ttlDays" in update ? (update.ttlDays ?? null) : (existing.ttlDays ?? null);

  const readBeforeTimestamp = chooseLater(existing.readBeforeTimestamp, update.readBeforeTimestamp);

  const snoozedUntil = mergeSnoozed(existing.snoozedUntil, update.snoozedUntil);
  const notes = mergeNotes(existing.notes, update.notes);
  const tagIds = mergeTags(existing.tagIds, update.tagIds, removed.tagIds);

  return {
    readIds: maxReadIds && readIds.length > maxReadIds ? readIds.slice(-maxReadIds) : readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    globalFilter,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
    tagIds,
    ttlDays,
  };
}

/** Partial<ReadState> にデフォルト値を補完して完全な ReadState を返す（古いデータ形式との互換性）*/
export function normalizeReadState(stored: Partial<ReadState>): ReadState {
  return {
    readIds: stored.readIds ?? [],
    bookmarkIds: stored.bookmarkIds ?? [],
    readingListIds: stored.readingListIds ?? [],
    likeIds: stored.likeIds ?? [],
    globalFilter: stored.globalFilter ?? null,
    readBeforeTimestamp: stored.readBeforeTimestamp ?? null,
    snoozedUntil: stored.snoozedUntil ?? null,
    notes: stored.notes ?? null,
    tagIds: stored.tagIds ?? null,
    ttlDays: stored.ttlDays ?? null,
  };
}

/**
 * 2 つの snoozedUntil マップが構造的に等しいかを判定する (#686)。
 *
 * `useReadStateSyncApply` のサーバーマージ処理は、内容が変わっていなくても
 * `setSnoozedUntil(new Object)` を呼んで reference を更新してしまう。これにより
 * `useFilteredArticles` の `structuralFiltered` useMemo が 2 秒毎に再実行されて
 * 全記事フィルター pass で 20-80ms の主スレッドブロックを発生させていた。
 *
 * 本関数を `setSnoozedUntil` 前のガードに使えば、内容変化なしの場合は state 更新を
 * skip して reference を保持し、useMemo の不要な再実行を回避できる。
 *
 * 等価判定:
 *   - キー集合が同じ
 *   - 各キーの値 (ISO 8601 文字列) が同じ
 *
 * 実装上の注意:
 *   - `Object.entries` でループするので O(n) (snoozed は最大 500 件制約あり)
 *   - 値は ISO 8601 文字列なので === で比較可
 *   - キー順序は問わない (Record なので順序は無関係)
 */
export function equalSnoozedUntil(a: Record<string, string>, b: Record<string, string>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
