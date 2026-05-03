"use client";

import { useCallback, useRef } from "react";
import type { KeywordFilter, ReadState } from "../types";
import { STORAGE_KEYS, deferSaveSet, saveJson, storageSet } from "../lib/storage";
import { type SetKind, type PendingSets, pruneExpiredSnoozes } from "../lib/read-state-storage";
import type { ReadStateSets } from "./useReadStatePersistence";

export interface SetStateDispatchers {
  read: React.Dispatch<React.SetStateAction<Set<string>>>;
  bookmarks: React.Dispatch<React.SetStateAction<Set<string>>>;
  readingList: React.Dispatch<React.SetStateAction<Set<string>>>;
  likes: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export interface OtherStateDispatchers {
  setGlobalFilterState: React.Dispatch<React.SetStateAction<KeywordFilter | null>>;
  setTtlDaysState: React.Dispatch<React.SetStateAction<number | null>>;
  setReadBeforeTimestamp: React.Dispatch<React.SetStateAction<string | null>>;
  setSnoozedUntil: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNotesState: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTagIdsState: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

function mergeServerSet(
  setState: (updater: (prev: Set<string>) => Set<string>) => void,
  storageKey: string,
  serverValues: string[],
): void {
  setState((prev) => {
    const newValues = serverValues.filter((v) => !prev.has(v));
    if (newValues.length === 0) return prev;
    const merged = new Set([...prev, ...newValues]);
    deferSaveSet(storageKey, merged);
    return merged;
  });
}

export interface ApplyServerStateDeps {
  stateRef: React.MutableRefObject<ReadStateSets>;
  pendingAddedRef: React.MutableRefObject<PendingSets>;
  pendingRemovedRef: React.MutableRefObject<PendingSets>;
  pendingTagChangedRef: React.MutableRefObject<Set<string>>;
  pendingTagRemovedRef: React.MutableRefObject<Set<string>>;
  dispatchers: SetStateDispatchers;
  otherDispatchers: OtherStateDispatchers;
}

export function useApplyServerState(deps: ApplyServerStateDeps) {
  const {
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    dispatchers,
    otherDispatchers,
  } = deps;
  const {
    read: setReadIds,
    bookmarks: setBookmarkIds,
    readingList: setReadingListIds,
    likes: setLikeIds,
  } = dispatchers;
  const {
    setGlobalFilterState,
    setTtlDaysState,
    setReadBeforeTimestamp,
    setSnoozedUntil,
    setNotesState,
    setTagIdsState,
  } = otherDispatchers;

  const lastServerSyncRef = useRef<number>(0);

  const applyServerState = useCallback(
    (state: ReadState) => {
      lastServerSyncRef.current = Date.now();
      const serverSets: Record<SetKind, Set<string>> = {
        read: new Set(state.readIds),
        bookmarks: new Set(state.bookmarkIds),
        readingList: new Set(state.readingListIds),
        likes: new Set(state.likeIds),
      };
      const localSets: Record<SetKind, Set<string>> = {
        read: stateRef.current.read,
        bookmarks: stateRef.current.bookmarks,
        readingList: stateRef.current.readingList,
        likes: stateRef.current.likes,
      };
      for (const kind of ["read", "bookmarks", "readingList", "likes"] as SetKind[]) {
        for (const id of localSets[kind]) {
          if (!serverSets[kind].has(id) && !pendingRemovedRef.current[kind].has(id)) {
            pendingAddedRef.current[kind].add(id);
          }
        }
      }
      mergeServerSet(setReadIds, STORAGE_KEYS.READ_IDS, state.readIds);
      mergeServerSet(setBookmarkIds, STORAGE_KEYS.BOOKMARK_IDS, state.bookmarkIds);
      mergeServerSet(setReadingListIds, STORAGE_KEYS.READING_LIST_IDS, state.readingListIds);
      mergeServerSet(setLikeIds, STORAGE_KEYS.LIKE_IDS, state.likeIds);
      if ("globalFilter" in state) {
        const serverFilter = state.globalFilter ?? null;
        saveJson(STORAGE_KEYS.GLOBAL_FILTER, serverFilter);
        setGlobalFilterState(serverFilter);
      }
      if ("ttlDays" in state) {
        const ttl = state.ttlDays ?? null;
        storageSet(STORAGE_KEYS.TTL_DAYS, ttl === null ? "" : String(ttl));
        setTtlDaysState(ttl);
      }
      if ("readBeforeTimestamp" in state && state.readBeforeTimestamp) {
        const rbt = state.readBeforeTimestamp;
        setReadBeforeTimestamp((prev) => {
          const next = !prev || rbt > prev ? rbt : prev;
          if (next !== prev) storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          return next;
        });
      }
      if ("snoozedUntil" in state && state.snoozedUntil) {
        const snoozed = state.snoozedUntil;
        setSnoozedUntil((prev) => {
          const result: Record<string, string> = { ...snoozed };
          for (const [id, until] of Object.entries(prev)) {
            if (!result[id] || until > result[id]) result[id] = until;
          }
          const merged = pruneExpiredSnoozes(result);
          saveJson(STORAGE_KEYS.SNOOZED_UNTIL, merged);
          return merged;
        });
      }
      if ("notes" in state) {
        setNotesState((prev) => {
          const merged = { ...prev, ...(state.notes ?? {}) };
          saveJson(STORAGE_KEYS.NOTES, merged);
          return merged;
        });
      }
      if ("tagIds" in state) {
        const serverTags = state.tagIds ?? {};
        setTagIdsState((prev) => {
          const result: Record<string, string[]> = {};
          for (const [k, v] of Object.entries(serverTags)) {
            if (pendingTagRemovedRef.current.has(k)) continue;
            if (pendingTagChangedRef.current.has(k)) continue;
            result[k] = v;
          }
          for (const [k, v] of Object.entries(prev)) {
            if (pendingTagRemovedRef.current.has(k)) continue;
            if (k in result) continue;
            result[k] = v;
            if (!(k in serverTags)) {
              pendingTagChangedRef.current.add(k);
            }
          }
          saveJson(STORAGE_KEYS.TAGS, result);
          return result;
        });
      }
    },
    [
      stateRef,
      pendingAddedRef,
      pendingRemovedRef,
      pendingTagChangedRef,
      pendingTagRemovedRef,
      setReadIds,
      setBookmarkIds,
      setReadingListIds,
      setLikeIds,
      setGlobalFilterState,
      setTtlDaysState,
      setReadBeforeTimestamp,
      setSnoozedUntil,
      setNotesState,
      setTagIdsState,
    ],
  );

  return { applyServerState, lastServerSyncRef };
}
