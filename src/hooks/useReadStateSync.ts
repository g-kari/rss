"use client";

import type { KeywordFilter } from "../types";
import type { PendingSets } from "../lib/read-state-storage";
import type { ReadStateSets } from "./useReadStatePersistence";
import type { UserProfile } from "../types";
import type { SetStateDispatchers, OtherStateDispatchers } from "./useReadStateSyncApply";
import { useApplyServerState } from "./useReadStateSyncApply";
import { useReadStateSyncFlush } from "./useReadStateSyncFlush";

export interface ReadStateSyncDeps {
  user: UserProfile | null | undefined;
  stateRef: React.MutableRefObject<ReadStateSets>;
  globalFilterRef: React.RefObject<KeywordFilter | null>;
  pendingAddedRef: React.MutableRefObject<PendingSets>;
  pendingRemovedRef: React.MutableRefObject<PendingSets>;
  globalFilterDirtyRef: React.MutableRefObject<boolean>;
  pendingTagChangedRef: React.MutableRefObject<Set<string>>;
  pendingTagRemovedRef: React.MutableRefObject<Set<string>>;
  dispatchers: SetStateDispatchers;
  otherDispatchers: OtherStateDispatchers;
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
    dispatchers,
    otherDispatchers,
  } = deps;

  const { applyServerState, lastServerSyncRef } = useApplyServerState({
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    dispatchers,
    otherDispatchers,
  });

  return useReadStateSyncFlush({
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
  });
}
