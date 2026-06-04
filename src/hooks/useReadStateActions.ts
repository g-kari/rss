"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Article, KeywordFilter } from "../types";
import type { ToastApi } from "./useToast";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, SPECIAL_FEED_IDS, deferSaveSet, saveJson, storageSet } from "../lib/storage";
import { MAX_NOTE_LENGTH } from "../lib/validation";
import { pruneExpiredSnoozes } from "../lib/read-state-storage";
import { isLaterIso } from "../lib/read-state-merge";
import type { ReadStateSets } from "./useReadStatePersistence";

export interface ReadStateActionDeps {
  articles: Article[];
  historyIds: Set<string> | undefined;
  stateRef: MutableRefObject<ReadStateSets>;
  setReadIds: Dispatch<SetStateAction<Set<string>>>;
  setReadBeforeTimestamp: Dispatch<SetStateAction<string | null>>;
  setSnoozedUntil: Dispatch<SetStateAction<Record<string, string>>>;
  setNotesState: Dispatch<SetStateAction<Record<string, string>>>;
  setGlobalFilterState: Dispatch<SetStateAction<KeywordFilter | null>>;
  setTtlDaysState: Dispatch<SetStateAction<number | null>>;
  pendingAddedRef: MutableRefObject<{
    read: Set<string>;
    bookmarks: Set<string>;
    readingList: Set<string>;
    likes: Set<string>;
  }>;
  pendingRemovedRef: MutableRefObject<{
    read: Set<string>;
    bookmarks: Set<string>;
    readingList: Set<string>;
    likes: Set<string>;
  }>;
  globalFilterDirtyRef: MutableRefObject<boolean>;
  scheduleSyncRef: RefObject<() => void>;
}

export interface ReadStateActionResult {
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  markAllReadWithUndo: (feedId: string | null, toast: ToastApi) => void;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  setNote: (articleId: string, text: string) => void;
  deleteNote: (articleId: string) => void;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  setTtlDays: (days: number | null) => void;
}

export function useReadStateActions(deps: ReadStateActionDeps): ReadStateActionResult {
  const {
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
  } = deps;

  const historyIdsRef = useSyncedRef(historyIds);
  const articlesRef = useSyncedRef(articles);

  const markRead = useCallback(
    (articleId: string) => {
      setReadIds((prev) => {
        if (prev.has(articleId)) return prev;
        const next = new Set(prev);
        next.add(articleId);
        deferSaveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      pendingAddedRef.current.read.add(articleId);
      pendingRemovedRef.current.read.delete(articleId);
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setReadIds],
  );

  const markBulkRead = useCallback(
    (articleIds: string[]) => {
      const newIds = articleIds.filter((id) => !stateRef.current.read.has(id));
      if (newIds.length === 0) return;
      setReadIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.add(id);
        deferSaveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      for (const id of newIds) {
        pendingAddedRef.current.read.add(id);
        pendingRemovedRef.current.read.delete(id);
      }
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setReadIds],
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
        deferSaveSet(STORAGE_KEYS.READ_IDS, next);
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
          // ISO 比較は isLaterIso (Date.parse) 経由。raw `>` は offset 形式で cutoff 後退 (#1083)。
          const next = !prev || isLaterIso(now, prev) ? now : prev;
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          return next;
        });
      }
      scheduleSyncRef.current();
    },
    [
      historyIdsRef,
      articlesRef,
      stateRef,
      setReadIds,
      setReadBeforeTimestamp,
      pendingAddedRef,
      pendingRemovedRef,
      scheduleSyncRef,
    ],
  );

  const markAllReadWithUndo = useCallback(
    (feedId: string | null, toast: ToastApi) => {
      const prevReadIds = new Set(stateRef.current.read);
      const prevReadBeforeTimestamp = stateRef.current.readBeforeTimestamp;
      const prevPendingAdded = new Set(pendingAddedRef.current.read);
      const prevPendingRemoved = new Set(pendingRemovedRef.current.read);

      markAllRead(feedId);

      toast.undo("全て既読にしました", () => {
        setReadIds(prevReadIds);
        deferSaveSet(STORAGE_KEYS.READ_IDS, prevReadIds);
        if (!feedId) {
          setReadBeforeTimestamp(prevReadBeforeTimestamp);
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, prevReadBeforeTimestamp ?? "");
        }
        pendingAddedRef.current.read = prevPendingAdded;
        pendingRemovedRef.current.read = prevPendingRemoved;
        scheduleSyncRef.current();
      });
    },
    [
      stateRef,
      markAllRead,
      setReadIds,
      setReadBeforeTimestamp,
      pendingAddedRef,
      pendingRemovedRef,
      scheduleSyncRef,
    ],
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
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSnoozedUntil],
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
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNotesState],
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
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNotesState],
  );

  const setGlobalFilter = useCallback(
    (filter: KeywordFilter | null) => {
      saveJson(STORAGE_KEYS.GLOBAL_FILTER, filter);
      setGlobalFilterState(filter);
      globalFilterDirtyRef.current = true;
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setGlobalFilterState],
  );

  const setTtlDays = useCallback(
    (days: number | null) => {
      storageSet(STORAGE_KEYS.TTL_DAYS, days === null ? "" : String(days));
      setTtlDaysState(days);
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTtlDaysState],
  );

  return {
    markRead,
    markBulkRead,
    markAllRead,
    markAllReadWithUndo,
    snoozeArticle,
    setNote,
    deleteNote,
    setGlobalFilter,
    setTtlDays,
  };
}
