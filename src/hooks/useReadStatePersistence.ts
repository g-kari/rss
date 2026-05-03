"use client";

import { useState, useRef } from "react";
import type { Article, KeywordFilter } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, saveSet, loadSet, loadJson, storageGet } from "../lib/storage";
import { type PendingSets, emptyPendingSets, pruneExpiredSnoozes } from "../lib/read-state-storage";
import { useReadStateToggles } from "./useReadStateToggles";
import { useReadStateActions } from "./useReadStateActions";

export type ReadStateSets = {
  read: Set<string>;
  bookmarks: Set<string>;
  readingList: Set<string>;
  likes: Set<string>;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
  notes: Record<string, string>;
  tagIds: Record<string, string[]>;
  ttlDays: number | null;
};

export interface ReadStatePersistenceResult {
  readIds: Set<string>;
  setReadIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  bookmarkIds: Set<string>;
  setBookmarkIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  readingListIds: Set<string>;
  setReadingListIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  likeIds: Set<string>;
  setLikeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  globalFilter: KeywordFilter | null;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  readBeforeTimestamp: string | null;
  setReadBeforeTimestamp: React.Dispatch<React.SetStateAction<string | null>>;
  snoozedUntil: Record<string, string>;
  setSnoozedUntil: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  notes: Record<string, string>;
  setNotesState: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tagIds: Record<string, string[]>;
  setTagIdsState: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setGlobalFilterState: React.Dispatch<React.SetStateAction<KeywordFilter | null>>;
  ttlDays: number | null;
  setTtlDays: (days: number | null) => void;
  setTtlDaysState: React.Dispatch<React.SetStateAction<number | null>>;
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  markAllReadWithUndo: (feedId: string | null, toast: import("./useToast").ToastApi) => void;
  toggleRead: (articleId: string) => void;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  toggleLike: (articleId: string) => void;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  setNote: (articleId: string, text: string) => void;
  deleteNote: (articleId: string) => void;
  stateRef: React.MutableRefObject<ReadStateSets>;
  globalFilterRef: React.RefObject<KeywordFilter | null>;
  pendingAddedRef: React.MutableRefObject<PendingSets>;
  pendingRemovedRef: React.MutableRefObject<PendingSets>;
  globalFilterDirtyRef: React.MutableRefObject<boolean>;
}

const CLIENT_MAX_READ_IDS = 50_000;

export function useReadStatePersistence(
  articles: Article[],
  historyIds: Set<string> | undefined,
  scheduleSyncToServer: () => void,
  syncImmediately: () => void,
): ReadStatePersistenceResult {
  const scheduleSyncRef = useSyncedRef(scheduleSyncToServer);
  const syncImmediatelyRef = useSyncedRef(syncImmediately);

  // --- State declarations ---
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    const raw = loadSet(STORAGE_KEYS.READ_IDS);
    if (raw.size <= CLIENT_MAX_READ_IDS) return raw;
    const trimmed = new Set([...raw].slice(-CLIENT_MAX_READ_IDS));
    saveSet(STORAGE_KEYS.READ_IDS, trimmed);
    return trimmed;
  });
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.BOOKMARK_IDS),
  );
  const [readingListIds, setReadingListIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.READING_LIST_IDS),
  );
  const [likeIds, setLikeIds] = useState<Set<string>>(() => loadSet(STORAGE_KEYS.LIKE_IDS));
  const [notes, setNotesState] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(STORAGE_KEYS.NOTES, {}),
  );
  const [tagIds, setTagIdsState] = useState<Record<string, string[]>>(() =>
    loadJson<Record<string, string[]>>(STORAGE_KEYS.TAGS, {}),
  );
  const [globalFilter, setGlobalFilterState] = useState<KeywordFilter | null>(() =>
    loadJson<KeywordFilter | null>(STORAGE_KEYS.GLOBAL_FILTER, null),
  );
  const globalFilterRef = useSyncedRef<KeywordFilter | null>(globalFilter);
  const [ttlDays, setTtlDaysState] = useState<number | null>(() => {
    const stored = storageGet(STORAGE_KEYS.TTL_DAYS);
    if (stored === null || stored === "") return null;
    const n = Number(stored);
    return Number.isFinite(n) ? n : null;
  });
  const [readBeforeTimestamp, setReadBeforeTimestamp] = useState<string | null>(() =>
    storageGet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP),
  );
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, string>>(() =>
    pruneExpiredSnoozes(loadJson<Record<string, string>>(STORAGE_KEYS.SNOOZED_UNTIL, {})),
  );

  // --- Refs ---
  const pendingAddedRef = useRef<PendingSets>(emptyPendingSets());
  const pendingRemovedRef = useRef<PendingSets>(emptyPendingSets());
  const globalFilterDirtyRef = useRef(false);

  const stateRef = useRef<ReadStateSets>({
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
    tagIds,
    ttlDays,
  });
  stateRef.current = {
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
    tagIds,
    ttlDays,
  };

  // --- Toggles ---
  const { toggleRead, toggleBookmark, toggleReadingList, toggleLike } = useReadStateToggles({
    setReadIds,
    setBookmarkIds,
    setReadingListIds,
    setLikeIds,
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    scheduleSyncRef,
    syncImmediatelyRef,
  });

  // --- Actions ---
  const {
    markRead,
    markBulkRead,
    markAllRead,
    markAllReadWithUndo,
    snoozeArticle,
    setNote,
    deleteNote,
    setGlobalFilter,
    setTtlDays,
  } = useReadStateActions({
    articles,
    historyIds,
    stateRef,
    setReadIds,
    setReadBeforeTimestamp,
    setSnoozedUntil,
    setNotesState,
    setGlobalFilterState,
    setTtlDaysState,
    pendingAddedRef,
    pendingRemovedRef,
    globalFilterDirtyRef,
    scheduleSyncRef,
  });

  return {
    readIds,
    setReadIds,
    bookmarkIds,
    setBookmarkIds,
    readingListIds,
    setReadingListIds,
    likeIds,
    setLikeIds,
    globalFilter,
    setGlobalFilter,
    ttlDays,
    setTtlDays,
    setTtlDaysState,
    readBeforeTimestamp,
    setReadBeforeTimestamp,
    snoozedUntil,
    setSnoozedUntil,
    notes,
    setNotesState,
    tagIds,
    setTagIdsState,
    setGlobalFilterState,
    markRead,
    markBulkRead,
    markAllRead,
    markAllReadWithUndo,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
    toggleLike,
    snoozeArticle,
    setNote,
    deleteNote,
    stateRef,
    globalFilterRef,
    pendingAddedRef,
    pendingRemovedRef,
    globalFilterDirtyRef,
  };
}
