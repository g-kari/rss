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

export function snapshotPendingSets(pending: PendingSets): PendingSets {
  return {
    read: new Set(pending.read),
    bookmarks: new Set(pending.bookmarks),
    readingList: new Set(pending.readingList),
    likes: new Set(pending.likes),
  };
}

export function mergePendingSets(target: PendingSets, source: PendingSets): void {
  for (const kind of Object.keys(target) as SetKind[]) {
    for (const id of source[kind]) target[kind].add(id);
  }
}

export function pruneExpiredSnoozes(snoozed: Record<string, string>): Record<string, string> {
  const now = new Date().toISOString();
  const result: Record<string, string> = {};
  for (const [id, until] of Object.entries(snoozed)) {
    if (until > now) result[id] = until;
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
    },
  };
  if (includeGlobalFilter) payload.globalFilter = globalFilter;
  // ttlDays は全端末で同じ値を共有する想定のため常に送信する
  payload.ttlDays = ttlDays;
  return JSON.stringify(payload);
}
