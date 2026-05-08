"use client";
import { useMemo } from "react";
import type { Article, Collection, EngagementAction, Feed } from "../types";

interface UseArticleViewPropsOptions {
  selectedArticle: Article | null;
  bookmarkIds: Set<string>;
  handleToggleBookmark: (id: string) => void;
  readingListIds: Set<string>;
  handleToggleReadingList: (id: string) => void;
  likeIds: Set<string>;
  handleToggleLike: (id: string) => void;
  recordEngagement: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
  mobilePane: "sidebar" | "list" | "view";
  setMobilePane: (pane: "sidebar" | "list" | "view") => void;
  prevArticle: Article | null;
  nextArticle: Article | null;
  selectArticle: (article: Article) => void;
  feeds: Feed[];
  snoozeArticle: (id: string, durationMs: number) => void;
  notes: Record<string, string>;
  setNote: (articleId: string, text: string) => void;
  deleteNote: (articleId: string) => void;
  markRead: (id: string) => void;
  articleTagIds: Record<string, string[]>;
  addTag: (articleId: string, tag: string) => void;
  removeTag: (articleId: string, tag: string) => void;
  setArticleTags: (articleId: string, tags: readonly string[]) => void;
  clearArticleTags: (articleId: string) => void;
  collections: Collection[];
  addArticleToCollection: (collectionId: string, articleId: string) => Promise<void>;
  removeArticleFromCollection: (collectionId: string, articleId: string) => Promise<void>;
  createCollection: (name: string) => Promise<Collection | { error: string }>;
  autoMode: boolean;
  onAutoModeStop: () => void;
  onToggleAutoMode: () => void;
}

export function useArticleViewProps({
  selectedArticle,
  bookmarkIds,
  handleToggleBookmark,
  readingListIds,
  handleToggleReadingList,
  likeIds,
  handleToggleLike,
  recordEngagement,
  mobilePane,
  setMobilePane,
  prevArticle,
  nextArticle,
  selectArticle,
  feeds,
  snoozeArticle,
  notes,
  setNote,
  deleteNote,
  markRead,
  articleTagIds,
  addTag,
  removeTag,
  setArticleTags,
  clearArticleTags,
  collections,
  addArticleToCollection,
  removeArticleFromCollection,
  createCollection,
  autoMode,
  onAutoModeStop,
  onToggleAutoMode,
}: UseArticleViewPropsOptions) {
  return useMemo(
    () => ({
      article: selectedArticle,
      isBookmarked: selectedArticle ? bookmarkIds.has(selectedArticle.id) : false,
      onToggleBookmark: handleToggleBookmark,
      isInReadingList: selectedArticle ? readingListIds.has(selectedArticle.id) : false,
      onToggleReadingList: handleToggleReadingList,
      isLiked: selectedArticle ? likeIds.has(selectedArticle.id) : false,
      onToggleLike: handleToggleLike,
      onEngagement: recordEngagement,
      onMobileBack: () => setMobilePane("list"),
      currentMobilePane: mobilePane,
      onGoBack: () => setMobilePane("list"),
      prevArticle,
      nextArticle,
      onSelectPrev: prevArticle ? () => selectArticle(prevArticle) : undefined,
      onSelectNext: nextArticle ? () => selectArticle(nextArticle) : undefined,
      feeds,
      onSnooze: snoozeArticle,
      note: selectedArticle ? notes[selectedArticle.id] : undefined,
      onSetNote: setNote,
      onDeleteNote: deleteNote,
      onAutoMarkRead: markRead,
      tags: selectedArticle ? (articleTagIds[selectedArticle.id] ?? []) : [],
      allTags: articleTagIds,
      onAddTag: addTag,
      onRemoveTag: removeTag,
      onSetArticleTags: setArticleTags,
      onClearArticleTags: clearArticleTags,
      collections,
      onAddToCollection: addArticleToCollection,
      onRemoveFromCollection: removeArticleFromCollection,
      onCreateCollection: createCollection,
      autoMode,
      onAutoModeStop,
      onToggleAutoMode,
    }),
    [
      selectedArticle,
      bookmarkIds,
      handleToggleBookmark,
      readingListIds,
      handleToggleReadingList,
      likeIds,
      handleToggleLike,
      recordEngagement,
      mobilePane,
      setMobilePane,
      prevArticle,
      nextArticle,
      selectArticle,
      feeds,
      snoozeArticle,
      notes,
      setNote,
      deleteNote,
      markRead,
      articleTagIds,
      addTag,
      removeTag,
      setArticleTags,
      clearArticleTags,
      collections,
      addArticleToCollection,
      removeArticleFromCollection,
      createCollection,
      autoMode,
      onAutoModeStop,
      onToggleAutoMode,
    ],
  );
}
