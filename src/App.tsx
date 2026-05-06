"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import AppModals from "./components/AppModals";
import FeedSidebar from "./components/feed-sidebar";
import ArticleList from "./components/ArticleList";
import ArticleView from "./components/ArticleView";
import ErrorBoundary from "./components/ErrorBoundary";
import NSFWEyeAnimation from "./components/NSFWEyeAnimation";
import type { Article } from "./types";
import { useAuth } from "./hooks/useAuth";
import { useFeeds } from "./hooks/useFeeds";
import { useFeedGroups } from "./hooks/useFeedGroups";
import { useCollections } from "./hooks/useCollections";
import { useReadState } from "./hooks/useReadState";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { useFilteredArticles } from "./hooks/useFilteredArticles";
import { useReadingHistory } from "./hooks/useReadingHistory";
import { useUIState } from "./hooks/useUIState";
import { useHasOpenPopup } from "./hooks/usePopupLock";
import { updateFaviconBadge } from "./lib/favicon";
import { exportArticlesToMarkdown, exportNotesToMarkdown } from "./lib/export-markdown";
import { apiFetch, onApiError } from "./lib/api-fetch";
import { isArticle } from "./lib/type-guards";
import { isArticleRead } from "./lib/article-filter";
import { useGlobalFilterAutoRead } from "./hooks/useGlobalFilterAutoRead";
import { useAutoLoadMoreArticles } from "./hooks/useAutoLoadMoreArticles";
import { useEngagementToggles } from "./hooks/useEngagementToggles";
import { useFeedSelection } from "./hooks/useFeedSelection";
import { useModalState } from "./hooks/useModalState";
import { useFeedFilters } from "./hooks/useFeedFilters";
import { useFeedPatch } from "./hooks/useFeedPatch";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useEngagement } from "./hooks/useEngagement";
import { useRecommendations } from "./hooks/useRecommendations";
import { useColumnResize } from "./hooks/useColumnResize";
import { useSyncedRef } from "./hooks/useSyncedRef";
import { ReaderSettingsProvider, type ReaderSettings } from "./contexts/ReaderSettingsContext";
import { ArticleFilterProvider, type ArticleFilter } from "./contexts/ArticleFilterContext";
import { ToastProvider } from "./contexts/ToastContext";
import { FeedSidebarProvider } from "./contexts/FeedSidebarContext";
import ToastContainer from "./components/ToastContainer";
import { useToastState } from "./hooks/useToast";
import LandingPage from "./components/LandingPage";
import BetaRestrictedPage from "./components/BetaRestrictedPage";

import SkeletonSidebar from "./components/SkeletonSidebar";
import SkeletonArticleList from "./components/SkeletonArticleList";
import { getMobilePaneTransform } from "./hooks/useMobilePane";

export default function App() {
  const searchParams = useSearchParams();
  const { user, betaRestricted, sessionExpired } = useAuth();
  const isOnline = useOnlineStatus();
  const prevOnlineRef = useRef(isOnline);

  const initialMobilePane = searchParams.get("article")
    ? "view"
    : searchParams.get("feed")
      ? "list"
      : "sidebar";

  const {
    theme,
    toggleTheme,
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    layout,
    onChangeLayout,
    pinnedFeedIds,
    togglePinFeed,
    collapsedCategories,
    toggleCollapseCategory,
    mobilePane,
    setMobilePane,
    install,
    showHelp,
    setShowHelp,
    showFeedSwitcher,
    setShowFeedSwitcher,
    focusMode,
    toggleFocusMode,
    listFocusMode,
    toggleListFocusMode,
    setListFocusMode,
    exitFocusMode,
    nsfwMode,
    showNSFWAnimation,
    activateNSFW,
    deactivateNSFW,
    onNSFWAnimationComplete,
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
    deduplicateByLink,
    toggleDeduplicateByLink,
    lineHeight,
    onChangeLineHeight,
    contentWidth,
    onChangeContentWidth,
    textJustify,
    onChangeTextJustify,
    showSettings,
    setShowSettings,
    activeFeedView,
    onChangeActiveFeedView,
    galleryColumns,
    onChangeGalleryColumns,
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
    imageDlFolder,
    onChangeImageDlFolder,
    imageDlFolderNsfw,
    onChangeImageDlFolderNsfw,
    aiModel,
    onChangeAiModel,
  } = useUIState(initialMobilePane);

  const toast = useToastState();

  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      toast.success("接続が復帰しました");
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, toast]);

  // カラム幅（PC）
  const { sidebarWidth, listWidth, handleResizeStart, resetWidth } = useColumnResize();

  const {
    feeds,
    articles,
    loadingFeeds,
    loadingArticles,
    refreshing,
    newArticleCount,
    loadedFeedPages,
    onFeedAdded,
    prependArticle,
    removeFeed,
    updateFeed,
    appendFeeds,
    refreshFeeds,
    retryFeed,
    reinferFeed,
    dismissNewArticles,
    loadMoreFeedArticles,
    loadMoreAllFeedsArticles,
    skipRemainingPages,
    fetchError,
    retryInitialLoad,
  } = useFeeds(user, toast.error);

  const {
    groups: feedGroups,
    createGroup,
    renameGroup,
    setCollapsed: setFeedGroupCollapsed,
    setMuted: setFeedGroupMuted,
    deleteGroup,
    reorderGroup,
  } = useFeedGroups(user, toast.error);

  const {
    collections,
    createCollection,
    renameCollection,
    deleteCollection,
    addArticleToCollection,
    removeArticleFromCollection,
  } = useCollections(user, toast.error);

  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    loading: pushLoading,
    error: pushError,
    toggle: togglePush,
    sendTest: sendPushTest,
  } = usePushNotifications(user);

  const { historyIds, historyOrder, addToHistory } = useReadingHistory();

  const {
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    globalFilter,
    setGlobalFilter,
    ttlDays,
    setTtlDays,
    readBeforeTimestamp,
    snoozedUntil,
    markRead,
    markBulkRead,
    markAllRead: _markAllRead,
    markAllReadWithUndo,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
    toggleLike,
    snoozeArticle,
    notes,
    setNote,
    deleteNote,
    tagIds: articleTagIds,
    addTag,
    removeTag,
    setArticleTags,
    clearArticleTags,
    hasPendingChanges,
  } = useReadState(user, articles, historyIds);

  const readerSettings = useMemo<ReaderSettings>(
    () => ({
      fontSize,
      onChangeFontSize,
      fontFamily,
      onChangeFontFamily,
      theme,
      focusMode,
      toggleFocusMode,
      autoReadEnabled,
      toggleAutoRead,
      autoReadThreshold,
      cycleAutoReadThreshold,
      onChangeAutoReadThreshold,
      autoTranslate,
      toggleAutoTranslate,
      lineHeight,
      onChangeLineHeight,
      contentWidth,
      onChangeContentWidth,
      textJustify,
      onChangeTextJustify,
      galleryColumns,
      onChangeGalleryColumns,
      galleryCardSize,
      onChangeGalleryCardSize,
      galleryMinImagePx,
      onChangeGalleryMinImagePx,
      deduplicateByLink,
      toggleDeduplicateByLink,
      ttlDays,
      onChangeTtlDays: setTtlDays,
      imageDlFolder,
      onChangeImageDlFolder,
      imageDlFolderNsfw,
      onChangeImageDlFolderNsfw,
      aiModel,
      onChangeAiModel,
    }),
    [
      fontSize,
      onChangeFontSize,
      fontFamily,
      onChangeFontFamily,
      theme,
      focusMode,
      toggleFocusMode,
      autoReadEnabled,
      toggleAutoRead,
      autoReadThreshold,
      cycleAutoReadThreshold,
      onChangeAutoReadThreshold,
      autoTranslate,
      toggleAutoTranslate,
      lineHeight,
      onChangeLineHeight,
      contentWidth,
      onChangeContentWidth,
      textJustify,
      onChangeTextJustify,
      galleryColumns,
      onChangeGalleryColumns,
      galleryCardSize,
      onChangeGalleryCardSize,
      galleryMinImagePx,
      onChangeGalleryMinImagePx,
      deduplicateByLink,
      toggleDeduplicateByLink,
      ttlDays,
      setTtlDays,
      imageDlFolder,
      onChangeImageDlFolder,
      imageDlFolderNsfw,
      onChangeImageDlFolderNsfw,
      aiModel,
      onChangeAiModel,
    ],
  );

  // 通信エラーをトーストで通知する。短時間に複数発生しても 1 回に集約（UI ノイズ抑止）。
  useEffect(() => {
    let lastShownAt = 0;
    const unsubscribe = onApiError(({ message }) => {
      const now = Date.now();
      if (now - lastShownAt < 3000) return;
      lastShownAt = now;
      toast.error(`通信エラー: ${message}`);
    });
    return unsubscribe;
  }, [toast]);

  const { recordEngagement } = useEngagement(user);
  const {
    recommendations,
    loading: recommendationsLoading,
    dismiss: dismissRecommendation,
    refresh: refreshRecommendations,
    refreshing: recommendationsRefreshing,
  } = useRecommendations(user);

  const {
    selectedFeedId,
    setSelectedFeedId,
    selectedGroupId,
    setSelectedGroupId,
    selectedTag,
    setSelectedTag,
    selectedArticle,
    setSelectedArticle,
    selectedCollectionId,
    setSelectedCollectionId,
  } = useFeedSelection(articles, feedGroups);

  const { snoozeTargetId, setSnoozeTargetId, articleAnnouncement, setArticleAnnouncement } =
    useModalState();

  const hasOpenPopup = useHasOpenPopup();

  useGlobalFilterAutoRead(articles, globalFilter, readIds, markBulkRead);

  const totalUnread = useMemo(
    () => articles.filter((a) => !isArticleRead(a, readIds, readBeforeTimestamp)).length,
    [articles, readIds, readBeforeTimestamp],
  );

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) RSS Reader` : "RSS Reader";
    updateFaviconBadge(totalUnread).catch(() => {});
  }, [totalUnread]);

  const {
    toggleNsfwFeed,
    togglePriorityFeed,
    setCategoryFeed,
    setGroupFeed,
    muteFeed,
    setFeedView,
    saveFilter,
  } = useFeedPatch(updateFeed);

  function onFeedDeleted(id: string) {
    removeFeed(id);
    if (selectedFeedId === id) {
      setSelectedFeedId(null);
      setSelectedArticle(null);
    }
  }

  const onSaveArticleUrl = useCallback(
    async (url: string, mode: "bookmark" | "reading_list") => {
      try {
        const res = await apiFetch("/api/articles/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const raw = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(raw.error ?? "保存に失敗しました");
          return;
        }
        if (!isArticle(raw)) {
          toast.error("保存に失敗しました");
          return;
        }
        prependArticle(raw);
        if (mode === "bookmark") {
          toggleBookmark(raw.id);
          toast.success("ブックマークに追加しました");
        } else {
          toggleReadingList(raw.id);
          toast.success("後で読むに追加しました");
        }
      } catch {
        toast.error("保存に失敗しました");
      }
    },
    [prependArticle, toggleBookmark, toggleReadingList, toast],
  );

  const { nsfwFeedIds, groupFeedIds, mutedFeedIds } = useFeedFilters(
    feeds,
    feedGroups,
    selectedGroupId,
  );

  const { bookmarkCount, readingListCount, likeCount, historyCount } = useMemo(() => {
    let bm = 0,
      rl = 0,
      lk = 0,
      hist = 0;
    for (const a of articles) {
      if (bookmarkIds.has(a.id)) bm++;
      if (readingListIds.has(a.id)) rl++;
      if (likeIds.has(a.id)) lk++;
      if (historyIds.has(a.id)) hist++;
    }
    return { bookmarkCount: bm, readingListCount: rl, likeCount: lk, historyCount: hist };
  }, [articles, bookmarkIds, readingListIds, likeIds, historyIds]);

  const collectionArticleIds = useMemo(
    () =>
      selectedCollectionId
        ? new Set(collections.find((c) => c.id === selectedCollectionId)?.articleIds ?? [])
        : undefined,
    [selectedCollectionId, collections],
  );

  const [galleryAutoReadIds, setGalleryAutoReadIds] = useState<Set<string>>(() => new Set());
  const handleGalleryAutoRead = useCallback((id: string) => {
    setGalleryAutoReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  useEffect(() => {
    setGalleryAutoReadIds(new Set());
  }, [selectedFeedId, selectedGroupId, activeFeedView, layout]);

  const filterState = useFilteredArticles({
    articles,
    feeds,
    feedId: selectedFeedId,
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    historyIds,
    historyOrder,
    selectedArticleId: selectedArticle?.id,
    nsfwMode,
    nsfwFeedIds,
    globalFilter,
    setGlobalFilter,
    readBeforeTimestamp,
    snoozedUntil,
    mutedFeedIds,
    notes,
    groupFeedIds,
    selectedGroupId,
    activeFeedView,
    articleTags: articleTagIds,
    selectedTag,
    collectionArticleIds: collectionArticleIds,
    galleryAutoReadIds,
    deduplicateByLink,
  });

  const {
    filtered,
    hasMore,
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    readingListOnly,
    toggleReadingListOnly,
    likeOnly,
    toggleLikeOnly,
    noteOnly,
    digestMode,
    toggleDigestMode,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    readingTimeRange,
    cycleReadingTimeRange,
    query,
    searchRef,
    notifyArticlesAdded,
    duplicateInfo,
  } = filterState;

  const currentIndex = useMemo(
    () => (selectedArticle ? filtered.findIndex((a) => a.id === selectedArticle.id) : -1),
    [selectedArticle, filtered],
  );

  // サーバー側に未取得ページが残っているか（全フィード表示・単一フィード表示の両方に対応）
  const feedHasMorePages = useMemo(() => {
    if (selectedFeedId?.startsWith("__")) return false;
    if (selectedFeedId) {
      // 単一フィード表示
      const feed = feeds.find((f) => f.id === selectedFeedId);
      if (!feed?.pageCount) return false;
      const loadedPage = loadedFeedPages.get(selectedFeedId) ?? 1;
      return loadedPage <= feed.pageCount;
    }
    // 全フィード表示: いずれかのフィードに未読み込みページがあれば true
    return feeds.some((f) => {
      if (!f.pageCount) return false;
      const loadedPage = loadedFeedPages.get(f.id) ?? 1;
      return loadedPage <= f.pageCount;
    });
  }, [selectedFeedId, feeds, loadedFeedPages]);
  const prevArticle = currentIndex > 0 ? filtered[currentIndex - 1] : null;
  const nextArticle =
    currentIndex >= 0 && currentIndex < filtered.length - 1 ? filtered[currentIndex + 1] : null;

  // サーバーから過去記事をロードし、ロード完了後にクライアントページを自動拡張する
  const handleLoadMoreFeedArticles = useCallback(async () => {
    if (selectedFeedId) {
      await loadMoreFeedArticles(selectedFeedId);
    } else {
      await loadMoreAllFeedsArticles(feeds);
    }
    notifyArticlesAdded();
  }, [selectedFeedId, loadMoreFeedArticles, loadMoreAllFeedsArticles, feeds, notifyArticlesAdded]);

  useAutoLoadMoreArticles(hasMore, feedHasMorePages, loadingArticles, handleLoadMoreFeedArticles, [
    selectedFeedId,
    unreadOnly,
    bookmarkOnly,
    readingListOnly,
    noteOnly,
    sortOrder,
    dateRange,
    readingTimeRange,
    query,
    globalFilter,
  ]);

  const listFocusModeRef = useSyncedRef(listFocusMode);
  const wasInListFocusModeRef = useRef(false);

  const selectArticle = useCallback(
    (article: Article) => {
      if (listFocusModeRef.current) {
        wasInListFocusModeRef.current = true;
        toggleFocusMode();
      }
      setSelectedArticle(article);
      markRead(article.id);
      addToHistory(article.id);
      setMobilePane("view");
    },
    [listFocusModeRef, toggleFocusMode, setSelectedArticle, markRead, addToHistory, setMobilePane],
  );

  // フォーカスモード終了時にリストフォーカスモードを復元する
  const prevFocusModeRef = useRef(focusMode);
  useEffect(() => {
    if (prevFocusModeRef.current && !focusMode && wasInListFocusModeRef.current) {
      wasInListFocusModeRef.current = false;
      setListFocusMode(true);
    }
    prevFocusModeRef.current = focusMode;
  }, [focusMode, setListFocusMode]);

  const { handleToggleBookmark, handleToggleReadingList, handleToggleLike } = useEngagementToggles(
    articles,
    toggleBookmark,
    toggleReadingList,
    toggleLike,
    recordEngagement,
  );

  useKeyboardNav({
    filteredArticles: filtered,
    feeds,
    pinnedFeedIds,
    selectedFeedId,
    selectedArticle,
    readIds,
    readBeforeTimestamp,
    readingListIds,
    likeIds,
    setSelectedArticle,
    onSelectFeed: (id) => {
      setSelectedFeedId(id);
      setSelectedArticle(null);
    },
    markRead,
    markBulkRead,
    markAllRead: (feedId: string | null) => markAllReadWithUndo(feedId, toast),
    toggleBookmark,
    toggleRead,
    toggleReadingList,
    toggleLike,
    showToast: toast.info,
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    layout,
    onChangeLayout,
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    readingListOnly,
    toggleReadingListOnly,
    likeOnly,
    toggleLikeOnly,
    digestMode,
    toggleDigestMode,
    toggleSortOrder,
    cycleDateRange,
    cycleReadingTimeRange,
    readingTimeRange,
    searchRef,
    refreshFeeds,
    retryFeed,
    snoozeArticle,
    onShowSnoozeMenu: setSnoozeTargetId,
    onShowFeedSwitcher: () => setShowFeedSwitcher(true),
    onArticleAnnounce: setArticleAnnouncement,
  });

  const articleViewProps = useMemo(
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
    ],
  );

  const snoozeArticleTitle = snoozeTargetId
    ? (articles.find((a) => a.id === snoozeTargetId)?.title ?? "")
    : "";
  const handleSnooze = useCallback(
    (durationMs: number) => {
      if (!snoozeTargetId) return;
      snoozeArticle(snoozeTargetId, durationMs);
      const hours = Math.round(durationMs / (60 * 60 * 1000));
      toast.info(hours < 24 ? `${hours}時間スヌーズ` : "スヌーズ設定");
      const idx = filtered.findIndex((a) => a.id === snoozeTargetId);
      const next = filtered[idx + 1];
      if (next) setSelectedArticle(next);
    },
    [snoozeTargetId, snoozeArticle, toast, filtered, setSelectedArticle],
  );

  // ローディング
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
      </div>
    );
  }

  if (betaRestricted) return <BetaRestrictedPage />;

  if (!user) return <LandingPage />;

  const articleFilter: ArticleFilter = { ...filterState, onSaveFilter: saveFilter };

  return (
    <ToastProvider value={toast}>
      <ReaderSettingsProvider value={readerSettings}>
        <ArticleFilterProvider value={articleFilter}>
          <div
            data-layout="root"
            className="relative h-screen font-sans antialiased bg-surface-base text-text-strong lg:grid"
            style={{
              gridTemplateColumns: listFocusMode
                ? `0px 1fr 0px`
                : `${sidebarWidth}px ${listWidth}px 1fr`,
              gridTemplateRows: "100%",
              transition: "grid-template-columns 0.25s ease",
            }}
          >
            {/* skip-to-content: Tab キーでフォーカス時のみ表示。サイドバーをスキップして記事一覧へ */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-surface-elevated focus:text-text-strong focus:text-[13px] focus:shadow-lg focus:border focus:border-border-default focus:outline-none"
            >
              記事一覧へスキップ
            </a>
            {/* スクリーンリーダー向け: キーボードナビで記事切り替え時にタイトルをアナウンス */}
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {articleAnnouncement}
            </div>
            {/* オフラインバナー */}
            {!isOnline && (
              <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 py-1.5 bg-surface-subtle border-b border-border-default text-[11px] tracking-[0.04em] text-text-muted">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 1l10 10M8.5 3.5A4 4 0 0 0 2.5 7M10 5.5A6 6 0 0 0 5 2M4 8a2 2 0 0 1 4 0" />
                </svg>
                オフライン — キャッシュされたデータを表示中
                {hasPendingChanges && <span className="ml-1 text-text-faint">（同期待ち）</span>}
              </div>
            )}

            <ToastContainer />

            <AppModals
              sessionExpired={sessionExpired}
              snoozeTargetId={snoozeTargetId}
              snoozeArticleTitle={snoozeArticleTitle}
              onSnooze={handleSnooze}
              onSnoozeClose={() => setSnoozeTargetId(null)}
              showHelp={showHelp}
              onHelpClose={() => setShowHelp(false)}
              showSettings={showSettings}
              onSettingsClose={() => setShowSettings(false)}
              showFeedSwitcher={showFeedSwitcher}
              feeds={feeds}
              articles={articles}
              readIds={readIds}
              readBeforeTimestamp={readBeforeTimestamp}
              selectedFeedId={selectedFeedId}
              onSelectFeed={setSelectedFeedId}
              onFeedSwitcherClose={() => setShowFeedSwitcher(false)}
            />
            {/* NSFW 目が開くアニメーション */}
            {showNSFWAnimation && <NSFWEyeAnimation onComplete={onNSFWAnimationComplete} />}
            {newArticleCount > 0 && !focusMode && !listFocusMode && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  dismissNewArticles();
                  document
                    .querySelector<HTMLElement>('[role="listbox"][aria-label="記事"]')
                    ?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    dismissNewArticles();
                    document
                      .querySelector<HTMLElement>('[role="listbox"][aria-label="記事"]')
                      ?.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-ink text-ink-text text-[12px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] animate-fade-up cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />
                新着記事 {newArticleCount} 件
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissNewArticles();
                  }}
                  className="ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center -my-2 -mr-2 opacity-60 hover:opacity-100 transition-opacity"
                  aria-label="通知を閉じる"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
            )}
            {/* 記事一覧フォーカスモード解除ボタン（PC のみ表示。モバイルは単一ペイン表示のため不要） */}
            {listFocusMode && (
              <button
                onClick={exitFocusMode}
                className="fixed top-3 right-3 z-50 hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink-hover text-ink-text text-[11px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-all duration-200"
                aria-label="フォーカスモード解除"
                title="フォーカスモード解除 (Esc)"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3" />
                </svg>
                フォーカス解除
              </button>
            )}
            {/* フォーカスモード全画面オーバーレイ */}
            {focusMode && (
              <div
                className="fixed inset-0 z-50 bg-surface-base animate-slide-up overflow-hidden flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-label="フォーカスモード"
              >
                <button
                  onClick={exitFocusMode}
                  className="absolute top-4 right-4 z-10 p-2 text-text-faint hover:text-text-muted transition-colors duration-200"
                  aria-label="フォーカスモード終了"
                  title="フォーカスモード終了 (Esc)"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 4l12 12M16 4l-12 12" />
                  </svg>
                </button>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ErrorBoundary label="フォーカスモード">
                    <ArticleView {...articleViewProps} />
                  </ErrorBoundary>
                </div>
              </div>
            )}
            {/* カラムリサイズハンドル (PCのみ、記事一覧フォーカス / ポップアップ表示中は無効) */}
            {!listFocusMode && (
              <>
                <div
                  className={`hidden lg:block absolute top-0 bottom-0 w-3 cursor-col-resize z-[5] group ${hasOpenPopup ? "pointer-events-none opacity-0" : ""}`}
                  style={{ left: sidebarWidth - 2 }}
                  onMouseDown={(e) => handleResizeStart("sidebar", e)}
                  onDoubleClick={() => resetWidth("sidebar")}
                  aria-hidden={hasOpenPopup}
                >
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border-default group-hover:bg-text-muted transition-colors" />
                </div>
                <div
                  className={`hidden lg:block absolute top-0 bottom-0 w-3 cursor-col-resize z-[5] group ${hasOpenPopup ? "pointer-events-none opacity-0" : ""}`}
                  style={{ left: sidebarWidth + listWidth - 2 }}
                  onMouseDown={(e) => handleResizeStart("list", e)}
                  onDoubleClick={() => resetWidth("list")}
                  aria-hidden={hasOpenPopup}
                >
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border-default group-hover:bg-text-muted transition-colors" />
                </div>
              </>
            )}
            <div
              data-pane="sidebar"
              className="absolute inset-0 lg:relative lg:inset-auto overflow-hidden mobile-pane"
              style={{ transform: getMobilePaneTransform("sidebar", mobilePane) }}
              aria-hidden={mobilePane !== "sidebar" || undefined}
            >
              {loadingFeeds && feeds.length === 0 ? (
                <SkeletonSidebar />
              ) : (
                <ErrorBoundary label="サイドバー">
                  <FeedSidebarProvider
                    value={{
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
                      onMarkAllRead: (feedId) => {
                        const count = feedId
                          ? articles.filter(
                              (a) =>
                                a.feedHash === feedId &&
                                !isArticleRead(a, readIds, readBeforeTimestamp),
                            ).length
                          : totalUnread;
                        if (
                          count >= 50 &&
                          !window.confirm(`${count}件の未読記事を全て既読にしますか？`)
                        )
                          return;
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
                        const ids = articles
                          .filter((a) => feedSet.has(a.feedHash))
                          .map((a) => a.id);
                        if (ids.length > 0) markBulkRead(ids);
                      },
                      onMuteFeed: muteFeed,
                      onSetFeedView: setFeedView,
                      onChangeActiveFeedView: (view) => {
                        onChangeActiveFeedView(view);
                        setSelectedFeedId(null);
                        setSelectedGroupId(null);
                        setSelectedArticle(null);
                        if (view === "pictures" || view === "videos") {
                          onChangeLayout("gallery");
                        }
                      },
                      onDismissRecommendation: dismissRecommendation,
                      onRefreshRecommendations: refreshRecommendations,
                      onExportMarkdown: (mode) => {
                        const ids = mode === "reading_list" ? readingListIds : bookmarkIds;
                        exportArticlesToMarkdown(articles, ids, feeds, mode);
                      },
                      onExportNotes: () => {
                        exportNotesToMarkdown(articles, notes, feeds);
                      },
                      onSelectCollection: setSelectedCollectionId,
                      onCreateCollection: createCollection,
                      onRenameCollection: renameCollection,
                      onDeleteCollection: deleteCollection,
                    }}
                  >
                    <FeedSidebar
                      feeds={feeds}
                      articles={articles}
                      readIds={readIds}
                      readBeforeTimestamp={readBeforeTimestamp}
                      bookmarkCount={bookmarkCount}
                      readingListCount={readingListCount}
                      likeCount={likeCount}
                      historyCount={historyCount}
                      selectedFeedId={selectedFeedId}
                      selectedGroupId={selectedGroupId}
                      user={user}
                      theme={theme}
                      selectedTag={selectedTag}
                      articleTagIds={articleTagIds}
                      refreshing={refreshing}
                      loadingFeeds={loadingFeeds}
                      isOnline={isOnline}
                      pinnedFeedIds={pinnedFeedIds}
                      collapsedCategories={collapsedCategories}
                      nsfwMode={nsfwMode}
                      feedGroups={feedGroups}
                      activeFeedView={activeFeedView}
                      recommendations={recommendations}
                      recommendationsLoading={recommendationsLoading}
                      recommendationsRefreshing={recommendationsRefreshing}
                      noteCount={Object.keys(notes).length}
                      collections={collections}
                      selectedCollectionId={selectedCollectionId}
                      install={install}
                      push={{
                        supported: pushSupported,
                        subscribed: pushSubscribed,
                        loading: pushLoading,
                        error: pushError,
                        onToggle: togglePush,
                        onSendTest: sendPushTest,
                      }}
                    />
                  </FeedSidebarProvider>
                </ErrorBoundary>
              )}
            </div>
            <div
              id="main-content"
              tabIndex={-1}
              data-pane="list"
              className="absolute inset-0 lg:relative lg:inset-auto overflow-hidden mobile-pane focus:outline-none"
              style={{ transform: getMobilePaneTransform("list", mobilePane) }}
              aria-hidden={mobilePane !== "list" || undefined}
            >
              {loadingFeeds && feeds.length === 0 ? (
                <SkeletonArticleList layout={layout} />
              ) : (
                <ErrorBoundary label="記事一覧">
                  <ArticleList
                    feeds={feeds}
                    readIds={readIds}
                    readBeforeTimestamp={readBeforeTimestamp}
                    bookmarkIds={bookmarkIds}
                    selectedArticleId={selectedArticle?.id ?? null}
                    selectedFeedId={selectedFeedId}
                    layout={layout}
                    loading={loadingArticles}
                    fetchError={fetchError}
                    onRetry={retryInitialLoad}
                    onChangeLayout={onChangeLayout}
                    onMobileBack={() => setMobilePane("sidebar")}
                    onSelectArticle={selectArticle}
                    onToggleRead={toggleRead}
                    onToggleBookmark={toggleBookmark}
                    onMarkRead={markRead}
                    onMarkAllRead={() => {
                      const hasSubFilter =
                        (groupFeedIds && groupFeedIds.size > 0) ||
                        selectedCollectionId ||
                        selectedTag ||
                        activeFeedView;
                      if (hasSubFilter) {
                        const ids = filtered
                          .filter((a) => !isArticleRead(a, readIds, readBeforeTimestamp))
                          .map((a) => a.id);
                        if (ids.length === 0) return;
                        if (
                          ids.length >= 50 &&
                          !window.confirm(`${ids.length}件の未読記事を全て既読にしますか？`)
                        )
                          return;
                        markBulkRead(ids);
                        return;
                      }
                      const unreadCount = selectedFeedId
                        ? articles.filter(
                            (a) =>
                              a.feedHash === selectedFeedId &&
                              !isArticleRead(a, readIds, readBeforeTimestamp),
                          ).length
                        : totalUnread;
                      if (
                        unreadCount >= 50 &&
                        !window.confirm(`${unreadCount}件の未読記事を全て既読にしますか？`)
                      )
                        return;
                      markAllReadWithUndo(selectedFeedId, toast);
                      skipRemainingPages(selectedFeedId);
                    }}
                    feedHasMorePages={feedHasMorePages}
                    onLoadMoreFeedArticles={handleLoadMoreFeedArticles}
                    notes={notes}
                    activeFeedView={activeFeedView}
                    listFocusMode={listFocusMode}
                    onToggleListFocusMode={toggleListFocusMode}
                    onGalleryAutoRead={handleGalleryAutoRead}
                    duplicateInfo={duplicateInfo}
                  />
                </ErrorBoundary>
              )}
            </div>
            <main
              data-pane="view"
              className="absolute inset-0 lg:relative lg:inset-auto overflow-hidden mobile-pane"
              style={{ transform: getMobilePaneTransform("view", mobilePane) }}
              aria-hidden={mobilePane !== "view" || undefined}
            >
              <ErrorBoundary label="記事表示">
                <ArticleView {...articleViewProps} />
              </ErrorBoundary>
            </main>
          </div>
        </ArticleFilterProvider>
      </ReaderSettingsProvider>
    </ToastProvider>
  );
}
