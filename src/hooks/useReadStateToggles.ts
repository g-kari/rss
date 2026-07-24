"use client";

import {
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { STORAGE_KEYS, toggleSetItem } from "../lib/storage";
import type { SetKind, PendingSets } from "../lib/read-state-storage";
import type { ReadStateSets } from "./useReadStatePersistence";

function makeToggle(
  setter: Dispatch<SetStateAction<Set<string>>>,
  key: string,
  schedule: () => void,
  getCurrentSet: () => Set<string>,
  onAdd: (id: string) => void,
  onRemove: (id: string) => void,
): (id: string) => void {
  return (id) => {
    const isRemoval = getCurrentSet().has(id);
    toggleSetItem(setter, key, id, true);
    if (isRemoval) {
      onRemove(id);
    } else {
      onAdd(id);
      schedule();
    }
  };
}

export interface ToggleDeps {
  setReadIds: Dispatch<SetStateAction<Set<string>>>;
  setBookmarkIds: Dispatch<SetStateAction<Set<string>>>;
  setReadingListIds: Dispatch<SetStateAction<Set<string>>>;
  setLikeIds: Dispatch<SetStateAction<Set<string>>>;
  stateRef: MutableRefObject<ReadStateSets>;
  pendingAddedRef: MutableRefObject<PendingSets>;
  pendingRemovedRef: MutableRefObject<PendingSets>;
  scheduleSyncRef: RefObject<() => void>;
  syncImmediatelyRef: RefObject<() => void>;
}

interface ToggleResult {
  toggleRead: (id: string) => void;
  toggleBookmark: (id: string) => void;
  toggleReadingList: (id: string) => void;
  toggleLike: (id: string) => void;
}

export function useReadStateToggles(deps: ToggleDeps): ToggleResult {
  const {
    setReadIds,
    setBookmarkIds,
    setReadingListIds,
    setLikeIds,
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    scheduleSyncRef,
    syncImmediatelyRef,
  } = deps;

  return useMemo(() => {
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
        // scheduleSyncRef で isDirty / hasPendingChanges を立ててから syncImmediately で
        // 即時 flush に collapse する。schedule なしで syncImmediately 単独だと、先行 add が
        // ない孤立 removal では `if (!isDirtyRef && timer===null) return` で early-return され、
        // 削除がサーバーに送信されないまま滞留する (correctness 監査 finding)。add 経路 (recordAdd)
        // が schedule() を呼ぶのと対称化しつつ、removal の即時性は syncImmediately で維持する。
        scheduleSyncRef.current();
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
  }, [
    setReadIds,
    setBookmarkIds,
    setReadingListIds,
    setLikeIds,
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    scheduleSyncRef,
    syncImmediatelyRef,
  ]);
}
