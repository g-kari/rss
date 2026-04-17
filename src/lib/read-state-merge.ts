import type { KeywordFilter, ReadState } from "../types";

/** POST /api/read-state で送信する削除差分 */
export interface ReadStateRemovedIds {
  readIds?: string[];
  bookmarkIds?: string[];
  readingListIds?: string[];
  likeIds?: string[];
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
  const removedSet = new Set(removed ?? []);
  const result = new Set<string>();
  for (const id of existing ?? []) if (!removedSet.has(id)) result.add(id);
  for (const id of incoming ?? []) if (!removedSet.has(id)) result.add(id);
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
export function mergeReadStateUpdate(existing: ReadState, update: ReadStateUpdate): ReadState {
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

  return {
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    globalFilter,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
  };
}
