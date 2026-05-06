"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { KeywordFilter, ReadState } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import { STORAGE_KEYS, flushDeferredSaves } from "../lib/storage";
import {
  type PendingRefs,
  type PendingSnapshot,
  extractAndResetPending,
  restorePending,
  serializeReadState,
} from "../lib/read-state-storage";
import { fetchReadState, saveReadState } from "../lib/read-state-sync-api";
import type { ReadStateSets } from "./useReadStatePersistence";

export interface FlushDeps extends PendingRefs {
  user: { sub: string } | null | undefined;
  stateRef: React.MutableRefObject<ReadStateSets>;
  globalFilterRef: React.RefObject<KeywordFilter | null>;
  applyServerState: (state: ReadState) => void;
  lastServerSyncRef: React.MutableRefObject<number>;
}

export interface FlushResult {
  scheduleSyncToServer: () => void;
  syncImmediately: () => void;
  hasPendingChanges: boolean;
}

interface FlushPayload {
  snapshot: PendingSnapshot;
  body: string;
}

function prepareFlush(
  pendingRefs: PendingRefs,
  globalFilterRef: React.RefObject<KeywordFilter | null>,
  stateRef: React.MutableRefObject<ReadStateSets>,
): FlushPayload {
  const snapshot = extractAndResetPending(pendingRefs);
  const body = serializeReadState(
    snapshot.added,
    snapshot.removed,
    globalFilterRef.current,
    stateRef.current.readBeforeTimestamp,
    stateRef.current.snoozedUntil,
    stateRef.current.notes,
    {
      changedKeys: snapshot.tagChanged,
      removedKeys: snapshot.tagRemoved,
      currentTags: stateRef.current.tagIds,
    },
    snapshot.wasGfDirty,
    stateRef.current.ttlDays,
  );
  return { snapshot, body };
}

export function useReadStateSyncFlush(deps: FlushDeps): FlushResult {
  const {
    user,
    stateRef,
    globalFilterRef,
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    globalFilterDirtyRef,
    applyServerState,
    lastServerSyncRef,
  } = deps;

  const pendingRefs: PendingRefs = {
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    globalFilterDirtyRef,
  };

  const userRef = useSyncedRef(user);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const flushToServer = useCallback(async () => {
    if (!userRef.current) return;
    const { snapshot, body } = prepareFlush(pendingRefs, globalFilterRef, stateRef);
    const result = await saveReadState(body);
    if (result.ok && result.state) {
      setHasPendingChanges(false);
      applyServerState(result.state);
    } else {
      restorePending(pendingRefs, snapshot);
      setHasPendingChanges(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingRefs は安定参照
  }, [applyServerState, globalFilterRef, stateRef, userRef]);

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
    if (!isDirtyRef.current && syncTimerRef.current === null) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
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

  // visibilitychange: タブ復帰時はサーバーからマージ、非表示時は未送信データをフラッシュ
  useEventListener(
    "visibilitychange",
    () => {
      if (!userRef.current) return;
      if (document.visibilityState === "visible") {
        if (Date.now() - lastServerSyncRef.current < 15_000) return;
        fetchReadState().then((state) => {
          if (!state) return;
          applyServerState(state);
        });
      } else {
        if (!flushIfPending()) return;
        const { snapshot, body } = prepareFlush(pendingRefs, globalFilterRef, stateRef);
        saveReadState(body).then((result) => {
          if (result.ok && result.state) {
            applyServerState(result.state);
          } else {
            restorePending(pendingRefs, snapshot);
          }
        });
      }
    },
    document,
  );

  // オンライン復帰時に未送信の変更を即座にフラッシュ
  useEventListener("online", () => {
    if (!isDirtyRef.current && syncTimerRef.current === null) return;
    flushIfPending();
    isDirtyRef.current = false;
    void flushToServer();
  });

  // beforeunload: sendBeacon で確実に送信
  useEventListener("beforeunload", () => {
    flushDeferredSaves();
    if (!userRef.current) return;
    if (!flushIfPending()) return;
    const { snapshot, body } = prepareFlush(pendingRefs, globalFilterRef, stateRef);
    const MAX_BEACON_BYTES = 60_000;
    const blob = new Blob([body], { type: "application/json" });
    const accepted = blob.size <= MAX_BEACON_BYTES && navigator.sendBeacon("/api/read-state", blob);
    if (accepted) {
      // prepareFlush 内の extractAndResetPending で既にリセット済み
    } else {
      restorePending(pendingRefs, snapshot);
      try {
        localStorage.setItem(STORAGE_KEYS.BEACON_OVERFLOW, body);
      } catch {
        /* quota exceeded — データロスト */
      }
    }
  });

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
