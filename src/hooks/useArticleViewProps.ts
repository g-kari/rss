"use client";
import { useMemo, useRef } from "react";
import type { Article, Collection, EngagementAction, Feed } from "../types";
import { computeFeedStructuralSignature } from "../lib/feed-signature";

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
  /** Bookmark カスタム collection (案 B snapshot) — `bookmarkIds` を bulk 追加する */
  addArticlesToCollection: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
  removeArticleFromCollection: (collectionId: string, articleId: string) => Promise<void>;
  createCollection: (name: string) => Promise<Collection | { error: string }>;
  autoMode: boolean;
  onAutoModeStop: () => void;
  onToggleAutoMode: () => void;
}

/**
 * `ArticleView` コンポーネント向けの大量 props を集約して memo 化する hook。bookmark / readingList / like / note / tag / 各種 setter を 1 オブジェクトに集約。
 * @param options - selectedArticle + 各種 state / callback を含む options
 * @returns `<ArticleView>` に spread 渡しできる props オブジェクト
 */
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
  addArticlesToCollection,
  removeArticleFromCollection,
  createCollection,
  autoMode,
  onAutoModeStop,
  onToggleAutoMode,
}: UseArticleViewPropsOptions) {
  // #908 起票元 perf 監査: feeds は useFeedData が毎 fetch で新 reference を作り 5 分 poll で churn する。
  // raw feeds を deps に入れると articleViewProps の identity が毎 poll 変わり <ArticleView> memo が
  // 毎回 bail out して subtree 全再描画する。canonical signature-string パターン (ArticleList / useSidebarFeeds)
  // に揃え、構造シグネチャを deps にして feedsRef.current で安定値を渡す。
  const feedStructuralSignature = useMemo(() => computeFeedStructuralSignature(feeds), [feeds]);
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
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
      feeds: feedsRef.current,
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
      onAddBulkToCollection: addArticlesToCollection,
      bookmarkIds,
      onRemoveFromCollection: removeArticleFromCollection,
      onCreateCollection: createCollection,
      autoMode,
      onAutoModeStop,
      onToggleAutoMode,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feedStructuralSignature が feeds 構造を encode 済、feedsRef.current は ref 安定参照 (canonical: ArticleList / useSidebarFeeds)
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
      feedStructuralSignature,
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
      addArticlesToCollection,
      removeArticleFromCollection,
      createCollection,
      autoMode,
      onAutoModeStop,
      onToggleAutoMode,
    ],
  );
}
