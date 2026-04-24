"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { Article, KeywordFilter } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import {
  STORAGE_KEYS,
  SPECIAL_FEED_IDS,
  saveSet,
  loadSet,
  toggleSetItem,
  loadJson,
  saveJson,
  storageGet,
  storageSet,
} from "../lib/storage";
import { MAX_NOTE_LENGTH } from "../lib/validation";
import {
  type SetKind,
  type PendingSets,
  emptyPendingSets,
  pruneExpiredSnoozes,
} from "../lib/read-state-storage";

export type ReadStateSets = {
  read: Set<string>;
  bookmarks: Set<string>;
  readingList: Set<string>;
  likes: Set<string>;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
  notes: Record<string, string>;
  tagIds: Record<string, string[]>;
};

function makeToggle(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string,
  schedule: () => void,
  getCurrentSet: () => Set<string>,
  onAdd: (id: string) => void,
  onRemove: (id: string) => void,
): (id: string) => void {
  return (id) => {
    const isRemoval = getCurrentSet().has(id);
    toggleSetItem(setter, key, id);
    if (isRemoval) {
      onRemove(id);
    } else {
      onAdd(id);
      schedule();
    }
  };
}

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
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
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
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    const raw = loadSet(STORAGE_KEYS.READ_IDS);
    if (raw.size <= CLIENT_MAX_READ_IDS) return raw;
    // 古いエントリを切り捨て（配列末尾＝新しい順に保持）
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
  const [readBeforeTimestamp, setReadBeforeTimestamp] = useState<string | null>(() =>
    storageGet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP),
  );
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, string>>(() =>
    pruneExpiredSnoozes(loadJson<Record<string, string>>(STORAGE_KEYS.SNOOZED_UNTIL, {})),
  );

  const historyIdsRef = useSyncedRef(historyIds);
  const articlesRef = useSyncedRef(articles);

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
  };

  const markRead = useCallback(
    (articleId: string) => {
      setReadIds((prev) => {
        if (prev.has(articleId)) return prev;
        const next = new Set(prev);
        next.add(articleId);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      pendingAddedRef.current.read.add(articleId);
      pendingRemovedRef.current.read.delete(articleId);
      scheduleSyncRef.current();
    },
    [scheduleSyncRef],
  );

  const markBulkRead = useCallback(
    (articleIds: string[]) => {
      const newIds = articleIds.filter((id) => !stateRef.current.read.has(id));
      if (newIds.length === 0) return;
      setReadIds((prev) => {
        const next = new Set([...prev, ...newIds]);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      for (const id of newIds) {
        pendingAddedRef.current.read.add(id);
        pendingRemovedRef.current.read.delete(id);
      }
      scheduleSyncRef.current();
    },
    [scheduleSyncRef],
  );

  const markAllRead = useCallback(
    (feedId: string | null) => {
      setReadIds((prev) => {
        const arts = articlesRef.current;
        const { bookmarks, readingList, likes } = stateRef.current;
        const specialSets: Partial<Record<string, Set<string>>> = {
          [SPECIAL_FEED_IDS.BOOKMARKS]: bookmarks,
          [SPECIAL_FEED_IDS.READING_LIST]: readingList,
          [SPECIAL_FEED_IDS.LIKES]: likes,
          [SPECIAL_FEED_IDS.HISTORY]: historyIdsRef.current ?? new Set<string>(),
        };
        const specialSet = feedId ? (specialSets[feedId] ?? null) : null;
        const ids =
          specialSet !== null
            ? arts.filter((a) => specialSet.has(a.id)).map((a) => a.id)
            : feedId
              ? arts.filter((a) => a.feedHash === feedId).map((a) => a.id)
              : arts.map((a) => a.id);
        const next = new Set([...prev, ...ids]);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        for (const id of ids) {
          if (!prev.has(id)) {
            pendingAddedRef.current.read.add(id);
            pendingRemovedRef.current.read.delete(id);
          }
        }
        return next;
      });
      if (!feedId) {
        const now = new Date().toISOString();
        setReadBeforeTimestamp((prev) => {
          const next = !prev || now > prev ? now : prev;
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          return next;
        });
      }
      scheduleSyncRef.current();
    },
    [historyIdsRef, articlesRef, scheduleSyncRef],
  );

  const { toggleRead, toggleBookmark, toggleReadingList, toggleLike } = useMemo(() => {
    const recordAdd =
      (kind: SetKind) =>
      (id: string): void => {
        pendingAddedRef.current[kind].add(id);
        pendingRemovedRef.current[kind].delete(id);
      };
    const recordRemoval =
      (kind: SetKind) =>
      (id: string): void => {
        pendingRemovedRef.current[kind].add(id);
        pendingAddedRef.current[kind].delete(id);
        syncImmediatelyRef.current();
      };
    return {
      toggleRead: makeToggle(
        setReadIds,
        STORAGE_KEYS.READ_IDS,
        () => scheduleSyncRef.current(),
        () => stateRef.current.read,
        recordAdd("read"),
        recordRemoval("read"),
      ),
      toggleBookmark: makeToggle(
        setBookmarkIds,
        STORAGE_KEYS.BOOKMARK_IDS,
        () => scheduleSyncRef.current(),
        () => stateRef.current.bookmarks,
        recordAdd("bookmarks"),
        recordRemoval("bookmarks"),
      ),
      toggleReadingList: makeToggle(
        setReadingListIds,
        STORAGE_KEYS.READING_LIST_IDS,
        () => scheduleSyncRef.current(),
        () => stateRef.current.readingList,
        recordAdd("readingList"),
        recordRemoval("readingList"),
      ),
      toggleLike: makeToggle(
        setLikeIds,
        STORAGE_KEYS.LIKE_IDS,
        () => scheduleSyncRef.current(),
        () => stateRef.current.likes,
        recordAdd("likes"),
        recordRemoval("likes"),
      ),
    };
  }, [scheduleSyncRef, syncImmediatelyRef]);

  const setGlobalFilter = useCallback(
    (filter: KeywordFilter | null) => {
      saveJson(STORAGE_KEYS.GLOBAL_FILTER, filter);
      setGlobalFilterState(filter);
      globalFilterDirtyRef.current = true;
      scheduleSyncRef.current();
    },
    [scheduleSyncRef],
  );

  const snoozeArticle = useCallback(
    (articleId: string, durationMs: number) => {
      const until = new Date(Date.now() + durationMs).toISOString();
      setSnoozedUntil((prev) => {
        const next = pruneExpiredSnoozes({ ...prev, [articleId]: until });
        saveJson(STORAGE_KEYS.SNOOZED_UNTIL, next);
        return next;
      });
      scheduleSyncRef.current();
    },
    [scheduleSyncRef],
  );

  const setNote = useCallback(
    (articleId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_NOTE_LENGTH) return;
      setNotesState((prev) => {
        const next = { ...prev, [articleId]: trimmed };
        saveJson(STORAGE_KEYS.NOTES, next);
        return next;
      });
      scheduleSyncRef.current();
    },
    [scheduleSyncRef],
  );

  const deleteNote = useCallback(
    (articleId: string) => {
      setNotesState((prev) => {
        if (!(articleId in prev)) return prev;
        const next = { ...prev };
        delete next[articleId];
        saveJson(STORAGE_KEYS.NOTES, next);
        return next;
      });
      scheduleSyncRef.current();
    },
    [scheduleSyncRef],
  );

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
