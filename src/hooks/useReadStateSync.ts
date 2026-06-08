"use client";

import type { MutableRefObject, RefObject } from "react";
import type { KeywordFilter } from "../types";
import type { PendingSets } from "../lib/read-state-storage";
import type { ReadStateSets } from "./useReadStatePersistence";
import type { UserProfile } from "../types";
import type { SetStateDispatchers, OtherStateDispatchers } from "./useReadStateSyncApply";
import { useApplyServerState } from "./useReadStateSyncApply";
import { useReadStateSyncFlush } from "./useReadStateSyncFlush";

export interface ReadStateSyncDeps {
  user: UserProfile | null | undefined;
  stateRef: MutableRefObject<ReadStateSets>;
  globalFilterRef: RefObject<KeywordFilter | null>;
  pendingAddedRef: MutableRefObject<PendingSets>;
  pendingRemovedRef: MutableRefObject<PendingSets>;
  globalFilterDirtyRef: MutableRefObject<boolean>;
  pendingTagChangedRef: MutableRefObject<Set<string>>;
  pendingTagRemovedRef: MutableRefObject<Set<string>>;
  pendingNotesChangedRef: MutableRefObject<Set<string>>;
  pendingNotesRemovedRef: MutableRefObject<Set<string>>;
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
    pendingNotesChangedRef,
    pendingNotesRemovedRef,
    dispatchers,
    otherDispatchers,
  } = deps;

  const { applyServerState, lastServerSyncRef } = useApplyServerState({
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    pendingNotesChangedRef,
    pendingNotesRemovedRef,
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
    pendingNotesChangedRef,
    pendingNotesRemovedRef,
    globalFilterDirtyRef,
    applyServerState,
    lastServerSyncRef,
  });
}
