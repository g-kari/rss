"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { KeywordFilter, ReadState, UserProfile } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import {
  STORAGE_KEYS,
  deferSaveSet,
  saveJson,
  storageSet,
  flushDeferredSaves,
} from "../lib/storage";
import {
  type SetKind,
  type PendingSets,
  emptyPendingSets,
  snapshotPendingSets,
  mergePendingSets,
  pruneExpiredSnoozes,
  serializeReadState,
} from "../lib/read-state-storage";
import { apiFetch } from "../lib/api-fetch";
import { isReadState } from "../lib/type-guards";
import type { ReadStateSets } from "./useReadStatePersistence";

async function fetchReadState(): Promise<ReadState | null> {
  try {
    const res = await apiFetch("/api/read-state");
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isReadState(data) ? data : null;
  } catch {
    return null;
  }
}

interface SaveResult {
  ok: boolean;
  state?: ReadState;
  status?: number;
}

async function saveReadState(body: string): Promise<SaveResult> {
  try {
    const res = await apiFetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data: unknown = await res.json();
    if (!isReadState(data)) return { ok: false };
    return { ok: true, state: data };
  } catch {
    return { ok: false };
  }
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

export interface ReadStateSyncDeps {
  user: UserProfile | null | undefined;
  stateRef: React.MutableRefObject<ReadStateSets>;
  globalFilterRef: React.RefObject<KeywordFilter | null>;
  pendingAddedRef: React.MutableRefObject<PendingSets>;
  pendingRemovedRef: React.MutableRefObject<PendingSets>;
  globalFilterDirtyRef: React.MutableRefObject<boolean>;
  pendingTagChangedRef: React.MutableRefObject<Set<string>>;
  pendingTagRemovedRef: React.MutableRefObject<Set<string>>;
  setReadIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setBookmarkIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setReadingListIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLikeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setGlobalFilterState: React.Dispatch<React.SetStateAction<KeywordFilter | null>>;
  setTtlDaysState: React.Dispatch<React.SetStateAction<number | null>>;
  setReadBeforeTimestamp: React.Dispatch<React.SetStateAction<string | null>>;
  setSnoozedUntil: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNotesState: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTagIdsState: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export interface ReadStateSyncResult {
  scheduleSyncToServer: () => void;
  syncImmediately: () => void;
  hasPendingChanges: boolean;
}

export function useReadStateSync(deps: ReadStateSyncDeps): ReadStateSyncResult {
  const {
    user,
    stateRef,
    globalFilterRef,
    pendingAddedRef,
    pendingRemovedRef,
    globalFilterDirtyRef,
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
  } = deps;

  const userRef = useSyncedRef(user);
  const lastServerSyncRef = useRef<number>(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

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

  const buildBody = useCallback(
    (
      added: PendingSets,
      removed: PendingSets,
      tagChanged: Set<string>,
      tagRemoved: Set<string>,
      wasGfDirty: boolean,
    ) =>
      serializeReadState(
        added,
        removed,
        globalFilterRef.current,
        stateRef.current.readBeforeTimestamp,
        stateRef.current.snoozedUntil,
        stateRef.current.notes,
        {
          changedKeys: tagChanged,
          removedKeys: tagRemoved,
          currentTags: stateRef.current.tagIds,
        },
        wasGfDirty,
        stateRef.current.ttlDays,
      ),
    [globalFilterRef, stateRef],
  );

  const flushToServer = useCallback(async () => {
    if (!userRef.current) return;
    const added = snapshotPendingSets(pendingAddedRef.current);
    const removed = snapshotPendingSets(pendingRemovedRef.current);
    const tagChanged = new Set(pendingTagChangedRef.current);
    const tagRemoved = new Set(pendingTagRemovedRef.current);
    const wasGfDirty = globalFilterDirtyRef.current;
    pendingAddedRef.current = emptyPendingSets();
    pendingRemovedRef.current = emptyPendingSets();
    pendingTagChangedRef.current = new Set();
    pendingTagRemovedRef.current = new Set();
    globalFilterDirtyRef.current = false;
    const body = buildBody(added, removed, tagChanged, tagRemoved, wasGfDirty);
    const result = await saveReadState(body);
    if (result.ok && result.state) {
      setHasPendingChanges(false);
      applyServerState(result.state);
    } else {
      mergePendingSets(pendingAddedRef.current, added);
      mergePendingSets(pendingRemovedRef.current, removed);
      for (const k of tagChanged) pendingTagChangedRef.current.add(k);
      for (const k of tagRemoved) pendingTagRemovedRef.current.add(k);
      if (wasGfDirty) globalFilterDirtyRef.current = true;
      setHasPendingChanges(true);
    }
  }, [
    applyServerState,
    buildBody,
    userRef,
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    globalFilterDirtyRef,
  ]);

  const scheduleSyncToServer = useCallback(() => {
    isDirtyRef.current = true;
    setHasPendingChanges(true);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (!isDirtyRef.current) return;
      isDirtyRef.current = false;
      syncTimerRef.current = null;
      void flushToServer();
    }, 5000);
  }, [flushToServer]);

  const syncImmediately = useCallback(() => {
    if (!userRef.current) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    isDirtyRef.current = true;
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      if (!userRef.current) return;
      isDirtyRef.current = false;
      void flushToServer();
    }, 0);
  }, [flushToServer, userRef]);

  // ログイン後にサーバーの状態をマージ + オーバーフローリカバリ
  const userSub = user?.sub;
  useEffect(() => {
    if (!userSub) return;
    fetchReadState().then((state) => {
      if (!state) return;
      applyServerState(state);
    });
    const overflow = localStorage.getItem(STORAGE_KEYS.BEACON_OVERFLOW);
    if (overflow) {
      saveReadState(overflow).then((result) => {
        if (result.ok) {
          localStorage.removeItem(STORAGE_KEYS.BEACON_OVERFLOW);
          if (result.state) applyServerState(result.state);
        }
      });
    }
  }, [userSub, applyServerState]);

  function flushIfPending(): boolean {
    if (syncTimerRef.current === null) return false;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    isDirtyRef.current = false;
    return true;
  }

  // タブ復帰時に他デバイスの変更をサーバーから取り込む
  useEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "visible") return;
      if (!userRef.current) return;
      if (Date.now() - lastServerSyncRef.current < 15_000) return;
      fetchReadState().then((state) => {
        if (!state) return;
        applyServerState(state);
      });
    },
    document,
  );

  // オンライン復帰時に未送信の変更を即座にフラッシュ
  useEventListener("online", () => {
    if (isDirtyRef.current || syncTimerRef.current !== null) {
      void flushToServer();
    }
  });

  // beforeunload: sendBeacon で確実に送信
  useEventListener("beforeunload", () => {
    flushDeferredSaves();
    if (!userRef.current) return;
    if (!flushIfPending()) return;
    const added = snapshotPendingSets(pendingAddedRef.current);
    const removed = snapshotPendingSets(pendingRemovedRef.current);
    const tagChanged = new Set(pendingTagChangedRef.current);
    const tagRemoved = new Set(pendingTagRemovedRef.current);
    const wasGfDirty = globalFilterDirtyRef.current;
    const body = buildBody(added, removed, tagChanged, tagRemoved, wasGfDirty);
    const MAX_BEACON_BYTES = 60_000;
    const blob = new Blob([body], { type: "application/json" });
    const accepted = blob.size <= MAX_BEACON_BYTES && navigator.sendBeacon("/api/read-state", blob);
    if (accepted) {
      pendingAddedRef.current = emptyPendingSets();
      pendingRemovedRef.current = emptyPendingSets();
      pendingTagChangedRef.current = new Set();
      pendingTagRemovedRef.current = new Set();
      globalFilterDirtyRef.current = false;
    } else {
      try {
        localStorage.setItem(STORAGE_KEYS.BEACON_OVERFLOW, body);
      } catch {
        /* quota exceeded — データロスト */
      }
    }
  });

  // visibilitychange hidden: タブ切り替え時
  useEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "hidden") return;
      if (!userRef.current) return;
      if (!flushIfPending()) return;
      const added = snapshotPendingSets(pendingAddedRef.current);
      const removed = snapshotPendingSets(pendingRemovedRef.current);
      const tagChanged = new Set(pendingTagChangedRef.current);
      const tagRemoved = new Set(pendingTagRemovedRef.current);
      const wasGfDirty = globalFilterDirtyRef.current;
      pendingAddedRef.current = emptyPendingSets();
      pendingRemovedRef.current = emptyPendingSets();
      pendingTagChangedRef.current = new Set();
      pendingTagRemovedRef.current = new Set();
      globalFilterDirtyRef.current = false;
      const body = buildBody(added, removed, tagChanged, tagRemoved, wasGfDirty);
      saveReadState(body).then((result) => {
        if (result.ok && result.state) {
          applyServerState(result.state);
        } else {
          mergePendingSets(pendingAddedRef.current, added);
          mergePendingSets(pendingRemovedRef.current, removed);
          for (const k of tagChanged) pendingTagChangedRef.current.add(k);
          for (const k of tagRemoved) pendingTagRemovedRef.current.add(k);
          if (wasGfDirty) globalFilterDirtyRef.current = true;
        }
      });
    },
    document,
  );

  // アンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, []);

  return { scheduleSyncToServer, syncImmediately, hasPendingChanges };
}
