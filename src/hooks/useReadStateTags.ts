"use client";

import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { STORAGE_KEYS, saveJson } from "../lib/storage";
import { normalizeTagName, normalizeTagArray } from "../lib/read-state-storage";
import { useSyncedRef } from "./useSyncedRef";
import type { ReadStateSets } from "./useReadStatePersistence";

export interface ReadStateTagsDeps {
  stateRef: MutableRefObject<ReadStateSets>;
  setTagIdsState: Dispatch<SetStateAction<Record<string, string[]>>>;
  scheduleSyncToServer: () => void;
}

export interface ReadStateTagsResult {
  addTag: (articleId: string, tag: string) => void;
  removeTag: (articleId: string, tag: string) => void;
  setArticleTags: (articleId: string, tags: readonly string[]) => void;
  clearArticleTags: (articleId: string) => void;
  pendingTagChangedRef: MutableRefObject<Set<string>>;
  pendingTagRemovedRef: MutableRefObject<Set<string>>;
}

export function useReadStateTags(deps: ReadStateTagsDeps): ReadStateTagsResult {
  const { stateRef, setTagIdsState, scheduleSyncToServer } = deps;
  const scheduleSyncRef = useSyncedRef(scheduleSyncToServer);

  const pendingTagChangedRef = useRef<Set<string>>(new Set());
  const pendingTagRemovedRef = useRef<Set<string>>(new Set());

  const setArticleTags = useCallback(
    (articleId: string, tags: readonly string[]) => {
      if (articleId.length === 0) return;
      const normalized = normalizeTagArray(tags);
      const before = stateRef.current.tagIds[articleId] ?? [];
      const same =
        before.length === normalized.length && before.every((v, i) => v === normalized[i]);
      if (same) return;
      if (normalized.length === 0) {
        pendingTagRemovedRef.current.add(articleId);
        pendingTagChangedRef.current.delete(articleId);
      } else {
        pendingTagChangedRef.current.add(articleId);
        pendingTagRemovedRef.current.delete(articleId);
      }
      setTagIdsState((prev) => {
        const next: Record<string, string[]> = { ...prev };
        if (normalized.length === 0) {
          if (!(articleId in prev)) return prev;
          delete next[articleId];
        } else {
          next[articleId] = normalized;
        }
        saveJson(STORAGE_KEYS.TAGS, next);
        return next;
      });
      scheduleSyncRef.current();
    },
    [stateRef, setTagIdsState, scheduleSyncRef],
  );

  const addTag = useCallback(
    (articleId: string, tag: string) => {
      const n = normalizeTagName(tag);
      if (!n) return;
      const current = stateRef.current.tagIds[articleId] ?? [];
      if (current.includes(n)) return;
      setArticleTags(articleId, [...current, n]);
    },
    [stateRef, setArticleTags],
  );

  const removeTag = useCallback(
    (articleId: string, tag: string) => {
      const n = normalizeTagName(tag);
      if (!n) return;
      const current = stateRef.current.tagIds[articleId] ?? [];
      if (!current.includes(n)) return;
      setArticleTags(
        articleId,
        current.filter((t) => t !== n),
      );
    },
    [stateRef, setArticleTags],
  );

  const clearArticleTags = useCallback(
    (articleId: string) => {
      setArticleTags(articleId, []);
    },
    [setArticleTags],
  );

  return {
    addTag,
    removeTag,
    setArticleTags,
    clearArticleTags,
    pendingTagChangedRef,
    pendingTagRemovedRef,
  };
}
