"use client";

import { useMemo } from "react";
import type { Feed, FeedGroup, FeedView, Article, Collection, Layout } from "../types";
import type { FeedSidebarActions } from "../contexts/FeedSidebarContext";
import type { ToastApi } from "./useToast";
import type { ConfirmOptions } from "./useConfirm";
import { isArticleRead } from "../lib/article-filter";
import { exportArticlesToMarkdown, exportNotesToMarkdown } from "../lib/export-markdown";
import { useSyncedRef } from "./useSyncedRef";

interface Options {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  notes: Record<string, string>;
  totalUnread: number;
  // Feed selection
  setSelectedFeedId: (id: string | null) => void;
  setSelectedGroupId: (id: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedArticle: (article: Article | null) => void;
  setMobilePane: (pane: "sidebar" | "list" | "view") => void;
  onChangeLayout: (layout: Layout) => void;
  // Feed CRUD
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  appendFeeds: (feeds: Feed[]) => void;
  // Read state
  markAllReadWithUndo: (feedId: string | null, toast: ToastApi) => void;
  markBulkRead: (ids: string[]) => void;
  toast: ToastApi;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // UI
  toggleTheme: () => void;
  setShowSettings: (show: boolean) => void;
  setShowHelp: (show: boolean) => void;
  onSaveArticleUrl: (url: string, mode: "bookmark" | "reading_list") => Promise<void>;
  // Feed operations
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  reinferFeed?: (feedId: string) => Promise<void>;
  togglePinFeed: (id: string) => void;
  toggleCollapseCategory: (category: string) => void;
  activateNSFW: () => void;
  deactivateNSFW: () => void;
  toggleNsfwFeed: (feed: Feed) => void;
  togglePriorityFeed: (feed: Feed) => void;
  setCategoryFeed?: (feed: Feed, category: string | null) => Promise<void>;
  setGroupFeed?: (feed: Feed, groupId: string | null) => Promise<void>;
  // Feed groups
  createGroup?: (name: string) => Promise<FeedGroup | { error: string }>;
  renameGroup?: (id: string, name: string) => Promise<FeedGroup | { error: string }>;
  deleteGroup?: (id: string) => Promise<boolean>;
  setFeedGroupCollapsed?: (id: string, collapsed: boolean) => Promise<void>;
  setFeedGroupMuted?: (id: string, muted: boolean) => Promise<void>;
  reorderGroup?: (id: string, direction: "up" | "down") => Promise<void>;
  muteFeed?: (feed: Feed, mutedUntil: string | null) => Promise<void>;
  setFeedView?: (feed: Feed, view: FeedView | null) => Promise<void>;
  setDigestLimit?: (feed: Feed, limit: number | null) => Promise<void>;
  onChangeActiveFeedView: (view: FeedView) => void;
  setSelectedFeedIdNull: () => void;
  // Recommendations
  dismissRecommendation?: (id: string) => void;
  refreshRecommendations?: () => void;
  // Collections
  setSelectedCollectionId: (id: string | null) => void;
  createCollection: (name: string) => Promise<Collection | { error: string }>;
  renameCollection: (id: string, name: string) => Promise<Collection | { error: string }>;
  deleteCollection: (id: string) => Promise<boolean>;
}

/**
 * FeedSidebarProvider に渡す value オブジェクトを生成する hook。
 * App.tsx から切り出したコールバック群をメモ化してまとめる。
 */
export function useFeedSidebarActions({
  feeds,
  articles,
  readIds,
  readBeforeTimestamp,
  bookmarkIds,
  readingListIds,
  notes,
  totalUnread,
  setSelectedFeedId,
  setSelectedGroupId,
  setSelectedTag,
  setSelectedArticle,
  setMobilePane,
  onChangeLayout,
  onFeedAdded,
  onFeedDeleted,
  updateFeed,
  appendFeeds,
  markAllReadWithUndo,
  markBulkRead,
  toast,
  confirm,
  toggleTheme,
  setShowSettings,
  setShowHelp,
  onSaveArticleUrl,
  refreshFeeds,
  retryFeed,
  reinferFeed,
  togglePinFeed,
  toggleCollapseCategory,
  activateNSFW,
  deactivateNSFW,
  toggleNsfwFeed,
  togglePriorityFeed,
  setCategoryFeed,
  setGroupFeed,
  createGroup,
  renameGroup,
  deleteGroup,
  setFeedGroupCollapsed,
  setFeedGroupMuted,
  reorderGroup,
  muteFeed,
  setFeedView,
  setDigestLimit,
  onChangeActiveFeedView,
  setSelectedFeedIdNull,
  dismissRecommendation,
  refreshRecommendations,
  setSelectedCollectionId,
  createCollection,
  renameCollection,
  deleteCollection,
}: Options): FeedSidebarActions {
  // readIds / articles は記事を読むたびに変化するため useSyncedRef でラップして deps から外す。
  // これにより FeedSidebar 全体が readIds 更新のたびに再レンダリングされる問題を回避する。
  const articlesRef = useSyncedRef(articles);
  const readIdsRef = useSyncedRef(readIds);
  const readBeforeTimestampRef = useSyncedRef(readBeforeTimestamp);
  const bookmarkIdsRef = useSyncedRef(bookmarkIds);
  const readingListIdsRef = useSyncedRef(readingListIds);
  const notesRef = useSyncedRef(notes);
  const totalUnreadRef = useSyncedRef(totalUnread);

  return useMemo<FeedSidebarActions>(
    () => ({
      onSelectFeed: (id) => {
        setSelectedFeedId(id);
        setSelectedGroupId(null);
        setSelectedTag(null);
        setSelectedArticle(null);
        setMobilePane("list");
        const feed = feeds.find((f) => f.id === id);
        if (feed?.view === "pictures" || feed?.view === "videos") {
          onChangeLayout("gallery");
        }
      },
      onSelectGroup: (id) => {
        setSelectedGroupId(id);
        setSelectedFeedId(null);
        setSelectedTag(null);
        setSelectedArticle(null);
        setMobilePane("list");
      },
      onSelectTag: (tag) => {
        setSelectedTag(tag);
        setSelectedFeedId(null);
        setSelectedGroupId(null);
        setSelectedArticle(null);
        setMobilePane("list");
      },
      onFeedAdded,
      onFeedDeleted,
      onFeedRenamed: updateFeed,
      onFeedsImported: appendFeeds,
      onMarkAllRead: async (feedId) => {
        const count = feedId
          ? articlesRef.current.filter(
              (a) =>
                a.feedHash === feedId &&
                !isArticleRead(a, readIdsRef.current, readBeforeTimestampRef.current),
            ).length
          : totalUnreadRef.current;
        if (count >= 50) {
          const ok = await confirm({
            title: "全既読の確認",
            message: `${count}件の未読記事を全て既読にしますか？`,
            confirmLabel: "既読にする",
          });
          if (!ok) return;
        }
        markAllReadWithUndo(feedId, toast);
      },
      onToggleTheme: toggleTheme,
      onOpenSettings: () => setShowSettings(true),
      onOpenHelp: () => setShowHelp(true),
      onSaveArticleUrl,
      onRefresh: refreshFeeds,
      onRetryFeed: retryFeed,
      onReinferFeed: reinferFeed,
      onTogglePinFeed: togglePinFeed,
      onToggleCollapseCategory: toggleCollapseCategory,
      onActivateNsfw: activateNSFW,
      onDeactivateNsfw: deactivateNSFW,
      onToggleNsfwFeed: toggleNsfwFeed,
      onTogglePriorityFeed: togglePriorityFeed,
      onSetCategoryFeed: setCategoryFeed,
      onSetGroupFeed: setGroupFeed,
      onCreateFeedGroup: createGroup,
      onRenameFeedGroup: renameGroup,
      onDeleteFeedGroup: deleteGroup,
      onToggleCollapseFeedGroup: setFeedGroupCollapsed,
      onToggleMuteFeedGroup: setFeedGroupMuted,
      onReorderFeedGroup: reorderGroup,
      onMarkAllReadInGroup: (feedIds) => {
        const feedSet = new Set(feedIds);
        const ids = articlesRef.current.filter((a) => feedSet.has(a.feedHash)).map((a) => a.id);
        if (ids.length > 0) markBulkRead(ids);
      },
      onMuteFeed: muteFeed,
      onSetFeedView: setFeedView,
      onSetDigestLimit: setDigestLimit,
      onChangeActiveFeedView: (view) => {
        onChangeActiveFeedView(view);
        setSelectedFeedIdNull();
        setSelectedGroupId(null);
        setSelectedArticle(null);
        if (view === "pictures" || view === "videos") {
          onChangeLayout("gallery");
        }
      },
      onDismissRecommendation: dismissRecommendation,
      onRefreshRecommendations: refreshRecommendations,
      onExportMarkdown: (mode) => {
        const ids = mode === "reading_list" ? readingListIdsRef.current : bookmarkIdsRef.current;
        exportArticlesToMarkdown(articlesRef.current, ids, feeds, mode);
      },
      onExportNotes: () => {
        exportNotesToMarkdown(articlesRef.current, notesRef.current, feeds);
      },
      onSelectCollection: setSelectedCollectionId,
      onCreateCollection: createCollection,
      onRenameCollection: renameCollection,
      onDeleteCollection: deleteCollection,
    }),
    [
      feeds,
      setSelectedFeedId,
      setSelectedGroupId,
      setSelectedTag,
      setSelectedArticle,
      setMobilePane,
      onChangeLayout,
      onFeedAdded,
      onFeedDeleted,
      updateFeed,
      appendFeeds,
      markAllReadWithUndo,
      markBulkRead,
      toast,
      confirm,
      toggleTheme,
      setShowSettings,
      setShowHelp,
      onSaveArticleUrl,
      refreshFeeds,
      retryFeed,
      reinferFeed,
      togglePinFeed,
      toggleCollapseCategory,
      activateNSFW,
      deactivateNSFW,
      toggleNsfwFeed,
      togglePriorityFeed,
      setCategoryFeed,
      setGroupFeed,
      createGroup,
      renameGroup,
      deleteGroup,
      setFeedGroupCollapsed,
      setFeedGroupMuted,
      reorderGroup,
      muteFeed,
      setFeedView,
      setDigestLimit,
      onChangeActiveFeedView,
      setSelectedFeedIdNull,
      dismissRecommendation,
      refreshRecommendations,
      setSelectedCollectionId,
      createCollection,
      renameCollection,
      deleteCollection,
    ],
  );
}
