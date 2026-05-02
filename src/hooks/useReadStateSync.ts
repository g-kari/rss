"use client";

import type { KeywordFilter } from "../types";
import type { PendingSets } from "../lib/read-state-storage";
import type { ReadStateSets } from "./useReadStatePersistence";
import type { UserProfile } from "../types";
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

  const { applyServerState, lastServerSyncRef } = useApplyServerState({
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
