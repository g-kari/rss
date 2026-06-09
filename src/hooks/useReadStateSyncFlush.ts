"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { KeywordFilter, ReadState } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import {
  STORAGE_KEYS,
  flushDeferredSaves,
  storageGet,
  storageRemove,
  storageSet,
} from "../lib/storage";
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
  stateRef: MutableRefObject<ReadStateSets>;
  globalFilterRef: RefObject<KeywordFilter | null>;
  applyServerState: (state: ReadState) => void;
  lastServerSyncRef: MutableRefObject<number>;
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
  globalFilterRef: RefObject<KeywordFilter | null>,
  stateRef: MutableRefObject<ReadStateSets>,
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
    [...snapshot.notesRemoved],
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
    pendingNotesChangedRef,
    pendingNotesRemovedRef,
    globalFilterDirtyRef,
    applyServerState,
    lastServerSyncRef,
  } = deps;

  const pendingRefs: PendingRefs = {
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    pendingNotesChangedRef,
    pendingNotesRemovedRef,
    globalFilterDirtyRef,
  };

  const userRef = useSyncedRef(user);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  // flush 実行中フラグ。await saveReadState の最中に online / visibilitychange / beforeunload
  // 経由で 2 回目の flushToServer が並行起動すると、prepareFlush が pending を全リセット済の状態で
  // 失敗パスの restorePending が別 flush のリセット済 ref に古い id を重複混入させる race を防ぐ。
  const isFlushingRef = useRef(false);
  // in-flight 中に来た flush 要求。完了後に 1 度だけ再 flush して取りこぼしを防ぐ。
  const flushAgainRef = useRef(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const flushToServer = useCallback(async () => {
    if (!userRef.current) return;
    if (isFlushingRef.current) {
      // 進行中の flush 完了後に再実行を予約 (並行 flush で snapshot/restore が交錯するのを防ぐ)
      flushAgainRef.current = true;
      return;
    }
    isFlushingRef.current = true;
    try {
      const { snapshot, body } = prepareFlush(pendingRefs, globalFilterRef, stateRef);
      const result = await saveReadState(body);
      if (result.ok && result.state) {
        setHasPendingChanges(false);
        applyServerState(result.state);
      } else {
        restorePending(pendingRefs, snapshot);
        setHasPendingChanges(true);
      }
    } finally {
      isFlushingRef.current = false;
      if (flushAgainRef.current) {
        flushAgainRef.current = false;
        void flushToServer();
      }
    }
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // pendingRefs / globalFilterRef / stateRef / userRef はいずれも ref (identity 不変)
    // flushToServer 自己参照 (in-flight 後の再 flush) も deps 不要 (関数 identity は安定)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyServerState]);

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
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushToServer]);

  // ログイン後にサーバーの状態をマージ + オーバーフローリカバリ
  const userSub = user?.sub;
  useEffect(() => {
    if (!userSub) return;
    fetchReadState().then((state) => {
      if (!state) return;
      applyServerState(state);
    });
    const overflow = storageGet(STORAGE_KEYS.BEACON_OVERFLOW);
    if (overflow) {
      saveReadState(overflow).then((result) => {
        if (result.ok) {
          storageRemove(STORAGE_KEYS.BEACON_OVERFLOW);
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
        // タブ非表示・バックグラウンド遷移時は、未送信の変更がある場合のみフラッシュする。
        // beforeunload の sendBeacon は 60KB 超のペイロードで失敗することがあるため、
        // visibilitychange の段階でできる限り早期にフラッシュしてデータロストリスクを低減する。
        const hadPending = flushIfPending();
        if (hadPending || isDirtyRef.current) {
          isDirtyRef.current = false;
          void flushToServer();
        }
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
    // 古い WebView 等で navigator.sendBeacon が undefined だと `undefined(...)` で TypeError
    // 発生する罠を feature detection で構造的予防 (browser-platform.md § ブラウザ仕様)。
    const accepted =
      blob.size <= MAX_BEACON_BYTES &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/read-state", blob);
    if (accepted) {
      // prepareFlush 内の extractAndResetPending で既にリセット済み
    } else {
      restorePending(pendingRefs, snapshot);
      // storageSet が内部で try/catch (quota exceeded — データロスト) を吸収する
      storageSet(STORAGE_KEYS.BEACON_OVERFLOW, body);
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
