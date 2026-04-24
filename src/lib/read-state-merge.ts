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
  };
}
