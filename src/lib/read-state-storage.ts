import type { KeywordFilter, ReadStatePayload } from "../types";
import { MAX_TAG_NAME_LENGTH, MAX_TAGS_PER_ARTICLE, stripControlChars } from "./validation";

export type SetKind = "read" | "bookmarks" | "readingList" | "likes";
export type PendingSets = Record<SetKind, Set<string>>;

export function emptyPendingSets(): PendingSets {
  return {
    read: new Set(),
    bookmarks: new Set(),
    readingList: new Set(),
    likes: new Set(),
  };
}

/**
@internal production caller 0。同 file の `extractAndResetPending` が internal caller。
 * `e2e/read-state-storage.spec.ts` が直接 import して単体検証しているため export は維持する
 * (dead export ではない)。cross-file の production caller が増えない限り、
 * 監査 sweep で dead export として再検出しないこと。
 */
export function snapshotPendingSets(pending: PendingSets): PendingSets {
  return {
    read: new Set(pending.read),
    bookmarks: new Set(pending.bookmarks),
    readingList: new Set(pending.readingList),
    likes: new Set(pending.likes),
  };
}

/**
@internal production caller 0。同 file の `restorePending` が internal caller。
 * `e2e/read-state-storage.spec.ts` が直接 import して単体検証しているため export は維持する
 * (dead export ではない)。cross-file の production caller が増えない限り、
 * 監査 sweep で dead export として再検出しないこと。
 */
export function mergePendingSets(target: PendingSets, source: PendingSets): void {
  for (const kind of Object.keys(target) as SetKind[]) {
    for (const id of source[kind]) target[kind].add(id);
  }
}

/** ペンディング状態のスナップショットを取得し、元をリセットする */
export interface PendingRefs {
  pendingAddedRef: { current: PendingSets };
  pendingRemovedRef: { current: PendingSets };
  pendingTagChangedRef: { current: Set<string> };
  pendingTagRemovedRef: { current: Set<string> };
  /** 編集した note の articleId を track する (#1113 flush 中の編集巻き戻り防止、tags の pendingTagChangedRef と対称) */
  pendingNotesChangedRef: { current: Set<string> };
  /** 削除した note の articleId を track する (#1084 cross-device note 削除) */
  pendingNotesRemovedRef: { current: Set<string> };
  globalFilterDirtyRef: { current: boolean };
}

export interface PendingSnapshot {
  added: PendingSets;
  removed: PendingSets;
  tagChanged: Set<string>;
  tagRemoved: Set<string>;
  notesChanged: Set<string>;
  notesRemoved: Set<string>;
  wasGfDirty: boolean;
}

export function extractAndResetPending(refs: PendingRefs): PendingSnapshot {
  const added = snapshotPendingSets(refs.pendingAddedRef.current);
  const removed = snapshotPendingSets(refs.pendingRemovedRef.current);
  const tagChanged = new Set(refs.pendingTagChangedRef.current);
  const tagRemoved = new Set(refs.pendingTagRemovedRef.current);
  const notesChanged = new Set(refs.pendingNotesChangedRef.current);
  const notesRemoved = new Set(refs.pendingNotesRemovedRef.current);
  const wasGfDirty = refs.globalFilterDirtyRef.current;
  refs.pendingAddedRef.current = emptyPendingSets();
  refs.pendingRemovedRef.current = emptyPendingSets();
  refs.pendingTagChangedRef.current = new Set();
  refs.pendingTagRemovedRef.current = new Set();
  refs.pendingNotesChangedRef.current = new Set();
  refs.pendingNotesRemovedRef.current = new Set();
  refs.globalFilterDirtyRef.current = false;
  return { added, removed, tagChanged, tagRemoved, notesChanged, notesRemoved, wasGfDirty };
}

export function restorePending(refs: PendingRefs, snapshot: PendingSnapshot): void {
  mergePendingSets(refs.pendingAddedRef.current, snapshot.added);
  mergePendingSets(refs.pendingRemovedRef.current, snapshot.removed);
  for (const k of snapshot.tagChanged) refs.pendingTagChangedRef.current.add(k);
  for (const k of snapshot.tagRemoved) refs.pendingTagRemovedRef.current.add(k);
  for (const k of snapshot.notesChanged) refs.pendingNotesChangedRef.current.add(k);
  for (const k of snapshot.notesRemoved) refs.pendingNotesRemovedRef.current.add(k);
  if (snapshot.wasGfDirty) refs.globalFilterDirtyRef.current = true;
}

export function pruneExpiredSnoozes(snoozed: Record<string, string>): Record<string, string> {
  // ISO 文字列の lexicographic 比較は timezone suffix で誤判定しうるため Date.parse の数値比較で
  // 「until が現在より未来か」を判定する (read-state-merge.ts#isLaterIso と同じ規範)。
  const nowMs = Date.now();
  const result: Record<string, string> = {};
  for (const [id, until] of Object.entries(snoozed)) {
    if (Date.parse(until) > nowMs) result[id] = until;
  }
  return result;
}

export function normalizeTagName(raw: string): string | null {
  const trimmed = stripControlChars(raw).trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TAG_NAME_LENGTH) return null;
  return trimmed;
}

export function normalizeTagArray(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tags) {
    if (result.length >= MAX_TAGS_PER_ARTICLE) break;
    const n = normalizeTagName(t);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    result.push(n);
  }
  return result;
}

export interface TagChanges {
  changedKeys: Set<string>;
  removedKeys: Set<string>;
  currentTags: Record<string, string[]>;
}

export function serializeReadState(
  added: PendingSets,
  removed: PendingSets,
  globalFilter: KeywordFilter | null,
  readBeforeTimestamp: string | null,
  snoozedUntil: Record<string, string>,
  notes: Record<string, string>,
  tagChanges: TagChanges,
  includeGlobalFilter: boolean,
  ttlDays: number | null,
  notesRemovedKeys: readonly string[] = [],
): string {
  const pruned = pruneExpiredSnoozes(snoozedUntil);
  const changedTags: Record<string, string[]> = {};
  for (const key of tagChanges.changedKeys) {
    const v = tagChanges.currentTags[key];
    if (v && v.length > 0) changedTags[key] = v;
  }
  const payload: ReadStatePayload = {
    readIds: [...added.read],
    bookmarkIds: [...added.bookmarks],
    readingListIds: [...added.readingList],
    likeIds: [...added.likes],
    readBeforeTimestamp,
    snoozedUntil: Object.keys(pruned).length > 0 ? pruned : null,
    notes: Object.keys(notes).length > 0 ? notes : null,
    tagIds: Object.keys(changedTags).length > 0 ? changedTags : null,
    removedIds: {
      readIds: [...removed.read],
      bookmarkIds: [...removed.bookmarks],
      readingListIds: [...removed.readingList],
      likeIds: [...removed.likes],
      tagIds: [...tagChanges.removedKeys],
      notes: [...notesRemovedKeys],
    },
  };
  if (includeGlobalFilter) payload.globalFilter = globalFilter;
  // ttlDays は全端末で同じ値を共有する想定のため常に送信する
  payload.ttlDays = ttlDays;
  return JSON.stringify(payload);
}
