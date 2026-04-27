"use client";

import { useRef } from "react";
import type { Article, KeywordFilter, UserProfile } from "../types";
import { useReadStatePersistence } from "./useReadStatePersistence";
import { useReadStateSync } from "./useReadStateSync";
import { useReadStateTags } from "./useReadStateTags";

export interface ReadStateResult {
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  globalFilter: KeywordFilter | null;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  ttlDays: number | null;
  setTtlDays: (days: number | null) => void;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
  notes: Record<string, string>;
  tagIds: Record<string, string[]>;
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  toggleRead: (articleId: string) => void;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  toggleLike: (articleId: string) => void;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  setNote: (articleId: string, text: string) => void;
  deleteNote: (articleId: string) => void;
  addTag: (articleId: string, tag: string) => void;
  removeTag: (articleId: string, tag: string) => void;
  setArticleTags: (articleId: string, tags: readonly string[]) => void;
  clearArticleTags: (articleId: string) => void;
  hasPendingChanges: boolean;
}

/**
 * ユーザーの既読・ブックマーク・後で読む・いいね状態を管理するフック。
 *
 * 内部的に 3 つのサブフックに分割:
 * - useReadStatePersistence: localStorage 読み書き・状態管理
 * - useReadStateSync: サーバー (R2) との同期
 * - useReadStateTags: タグ CRUD
 */
export function useReadState(
  user: UserProfile | null | undefined,
  articles: Article[],
  historyIds?: Set<string>,
): ReadStateResult {
  const scheduleSyncRef = useRef<() => void>(() => {});
  const syncImmediatelyRef = useRef<() => void>(() => {});

  const persistence = useReadStatePersistence(
    articles,
    historyIds,
    () => scheduleSyncRef.current(),
    () => syncImmediatelyRef.current(),
  );

  const tags = useReadStateTags({
    stateRef: persistence.stateRef,
    setTagIdsState: persistence.setTagIdsState,
    scheduleSyncToServer: () => scheduleSyncRef.current(),
  });

  const sync = useReadStateSync({
    user,
    stateRef: persistence.stateRef,
    globalFilterRef: persistence.globalFilterRef,
    pendingAddedRef: persistence.pendingAddedRef,
    pendingRemovedRef: persistence.pendingRemovedRef,
    globalFilterDirtyRef: persistence.globalFilterDirtyRef,
    pendingTagChangedRef: tags.pendingTagChangedRef,
    pendingTagRemovedRef: tags.pendingTagRemovedRef,
    setReadIds: persistence.setReadIds,
    setBookmarkIds: persistence.setBookmarkIds,
    setReadingListIds: persistence.setReadingListIds,
    setLikeIds: persistence.setLikeIds,
    setGlobalFilterState: persistence.setGlobalFilterState,
    setTtlDaysState: persistence.setTtlDaysState,
    setReadBeforeTimestamp: persistence.setReadBeforeTimestamp,
    setSnoozedUntil: persistence.setSnoozedUntil,
    setNotesState: persistence.setNotesState,
    setTagIdsState: persistence.setTagIdsState,
  });

  // 安定参照を更新
  scheduleSyncRef.current = sync.scheduleSyncToServer;
  syncImmediatelyRef.current = sync.syncImmediately;

  return {
    readIds: persistence.readIds,
    bookmarkIds: persistence.bookmarkIds,
    readingListIds: persistence.readingListIds,
    likeIds: persistence.likeIds,
    globalFilter: persistence.globalFilter,
    setGlobalFilter: persistence.setGlobalFilter,
    ttlDays: persistence.ttlDays,
    setTtlDays: persistence.setTtlDays,
    readBeforeTimestamp: persistence.readBeforeTimestamp,
    snoozedUntil: persistence.snoozedUntil,
    notes: persistence.notes,
    tagIds: persistence.tagIds,
    markRead: persistence.markRead,
    markBulkRead: persistence.markBulkRead,
    markAllRead: persistence.markAllRead,
    toggleRead: persistence.toggleRead,
    toggleBookmark: persistence.toggleBookmark,
    toggleReadingList: persistence.toggleReadingList,
    toggleLike: persistence.toggleLike,
    snoozeArticle: persistence.snoozeArticle,
    setNote: persistence.setNote,
    deleteNote: persistence.deleteNote,
    addTag: tags.addTag,
    removeTag: tags.removeTag,
    setArticleTags: tags.setArticleTags,
    clearArticleTags: tags.clearArticleTags,
    hasPendingChanges: sync.hasPendingChanges,
  };
}
