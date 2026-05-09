"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import AppModals from "./components/AppModals";
import FeedSidebar from "./components/feed-sidebar";
import ArticleList from "./components/ArticleList";
import ArticleView from "./components/ArticleView";
import ErrorBoundary from "./components/ErrorBoundary";
import NSFWEyeAnimation from "./components/NSFWEyeAnimation";
import OfflineBanner from "./components/OfflineBanner";
import NewArticleBanner from "./components/NewArticleBanner";
import FocusModeOverlay from "./components/FocusModeOverlay";
import ArticleDetailOverlay from "./components/ArticleDetailOverlay";
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
import { useThemePreference } from "./hooks/useThemePreference";
import { useLayoutSettings } from "./hooks/useLayoutSettings";
import { useAutoReadSettings } from "./hooks/useAutoReadSettings";
import { useAccessibilitySettings } from "./hooks/useAccessibilitySettings";
import { useNSFWMode } from "./hooks/useNSFWMode";
import { useFocusMode } from "./hooks/useFocusMode";
import { useAutoReadMode } from "./hooks/useAutoReadMode";
import { isSpeechSupported } from "./lib/auto-read";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { usePinnedAndCategories } from "./hooks/usePinnedAndCategories";
import { useEventListener } from "./hooks/useEventListener";
import { useHasOpenPopup } from "./hooks/usePopupLock";
import { updateFaviconBadge } from "./lib/favicon";
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
import { useArticleSelection } from "./hooks/useArticleSelection";
import { useConfirm } from "./hooks/useConfirm";
import { useMarkAllRead } from "./hooks/useMarkAllRead";
import { useDebounce } from "./hooks/useDebounce";
import { useFeedSidebarActions } from "./hooks/useFeedSidebarActions";
import { useArticleViewProps } from "./hooks/useArticleViewProps";
import { useDigestFeedOrder } from "./hooks/useDigestFeedOrder";
import ConfirmModal from "./components/ConfirmModal";
import ThreePaneLayout from "./components/ThreePaneLayout";
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
import { useMobilePane, getMobilePaneTransform } from "./hooks/useMobilePane";

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

  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const { theme, toggleTheme } = useThemePreference();
  const {
    layout,
    onChangeLayout,
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    activeFeedView,
    onChangeActiveFeedView,
    galleryColumns,
    onChangeGalleryColumns,
    galleryColumnsFocus,
    onChangeGalleryColumnsFocus,
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
    contentWidth,
    onChangeContentWidth,
    imageDlFolder,
    onChangeImageDlFolder,
    imageDlFolderNsfw,
    onChangeImageDlFolderNsfw,
  } = useLayoutSettings();
  const {
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
    deduplicateByLink,
    toggleDeduplicateByLink,
    aiModel,
    onChangeAiModel,
  } = useAutoReadSettings();
  const { lineHeight, onChangeLineHeight, textJustify, onChangeTextJustify } =
    useAccessibilitySettings();
  const { mobilePane, setMobilePane } = useMobilePane(initialMobilePane);
  const { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete } =
    useNSFWMode();
  const { pinnedFeedIds, togglePinFeed, collapsedCategories, toggleCollapseCategory } =
    usePinnedAndCategories();
  const { focusMode, listFocusMode, toggleFocusMode, toggleListFocusMode, exitFocusMode } =
    useFocusMode();
  const install = usePWAInstall();
  const { autoMode, toggleAutoMode, disableAutoMode } = useAutoReadMode();
  const ttsSupported = useMemo(() => isSpeechSupported(), []);

  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // モーダル系のグローバルキー: ? でヘルプトグル、Escape で閉じる
  // フォーカスモードの Escape は useFocusMode 側で別途処理される（責務分離）
  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?") setShowHelp((v) => !v);
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowFeedSwitcher(false);
      }
    },
    document,
  );

  const toast = useToastState();
  const { confirm, confirmModalProps } = useConfirm();
  // キーボードショートカット用のシンプルな confirm ラッパー（メッセージのみ）
  const confirmMessage = useCallback(
    (message: string) => confirm({ title: "確認", message }),
    [confirm],
  );

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
    feedLoadError,
    retryInitialLoad,
    retryFeedList,
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
    loadError: collectionsLoadError,
    retryCollections,
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
      galleryColumnsFocus,
      onChangeGalleryColumnsFocus,
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
      galleryColumnsFocus,
      onChangeGalleryColumnsFocus,
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
  const digestFeedOrder = useDigestFeedOrder(user);
  const {
    recommendations,
    loading: recommendationsLoading,
    error: recommendationsError,
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

  const debouncedReadIds = useDebounce(readIds, 200);
  const debouncedReadBeforeTimestamp = useDebounce(readBeforeTimestamp, 200);
  const totalUnread = useMemo(
    () =>
      articles.filter((a) => !isArticleRead(a, debouncedReadIds, debouncedReadBeforeTimestamp))
        .length,
    [articles, debouncedReadIds, debouncedReadBeforeTimestamp],
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
    setDigestLimit,
  } = useFeedPatch(updateFeed, toast.error);

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

  const bookmarkCount = bookmarkIds.size;
  const readingListCount = readingListIds.size;
  const likeCount = likeIds.size;
  const historyCount = historyIds.size;

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
    feedEngagementOrder: digestFeedOrder,
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

  const { onMarkAllRead } = useMarkAllRead({
    articles,
    filtered,
    readIds,
    readBeforeTimestamp,
    selectedFeedId,
    groupFeedIds,
    selectedCollectionId,
    selectedTag,
    activeFeedView,
    totalUnread,
    markBulkRead,
    markAllReadWithUndo,
    skipRemainingPages,
    toast,
    confirm,
  });

  const feedSidebarActions = useFeedSidebarActions({
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
    setSelectedFeedIdNull: () => {
      setSelectedFeedId(null);
      setSelectedGroupId(null);
      setSelectedArticle(null);
    },
    dismissRecommendation,
    refreshRecommendations,
    setSelectedCollectionId,
    createCollection,
    renameCollection,
    deleteCollection,
  });

  const { selectArticle, articleDetailOverlayOpen, closeArticleDetailOverlay } =
    useArticleSelection({
      setSelectedArticle,
      markRead,
      addToHistory,
      setMobilePane,
      isDesktop,
      listFocusMode,
    });

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
    confirm: confirmMessage,
    autoMode,
    toggleAutoMode,
    ttsSupported,
  });

  const articleViewProps = useArticleViewProps({
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
    onAutoModeStop: disableAutoMode,
    onToggleAutoMode: toggleAutoMode,
  });

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
          <ThreePaneLayout
            sidebarWidth={sidebarWidth}
            listWidth={listWidth}
            listFocusMode={listFocusMode}
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
            <OfflineBanner isOnline={isOnline} hasPendingChanges={hasPendingChanges} />

            <ToastContainer />

            <ConfirmModal {...confirmModalProps} />

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
            <NewArticleBanner
              newArticleCount={newArticleCount}
              focusMode={focusMode}
              listFocusMode={listFocusMode}
              onDismiss={dismissNewArticles}
            />
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
            <FocusModeOverlay
              focusMode={focusMode}
              exitFocusMode={exitFocusMode}
              articleViewProps={articleViewProps}
            />
            <ArticleDetailOverlay
              open={articleDetailOverlayOpen}
              onClose={closeArticleDetailOverlay}
              articleViewProps={articleViewProps}
            />
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
              aria-hidden={(!isDesktop && mobilePane !== "sidebar") || undefined}
              inert={(!isDesktop && mobilePane !== "sidebar") || undefined}
            >
              {loadingFeeds && feeds.length === 0 ? (
                <SkeletonSidebar />
              ) : (
                <ErrorBoundary label="サイドバー">
                  <FeedSidebarProvider value={feedSidebarActions}>
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
                      totalUnread={totalUnread}
                      activeFeedView={activeFeedView}
                      recommendations={recommendations}
                      recommendationsLoading={recommendationsLoading}
                      recommendationsRefreshing={recommendationsRefreshing}
                      recommendationsError={recommendationsError}
                      noteCount={Object.keys(notes).length}
                      collections={collections}
                      collectionsLoadError={collectionsLoadError}
                      onRetryCollections={retryCollections}
                      selectedCollectionId={selectedCollectionId}
                      install={install}
                      loadError={feedLoadError ? "フィードの読み込みに失敗しました" : null}
                      onRetry={retryFeedList}
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
              aria-hidden={(!isDesktop && mobilePane !== "list") || undefined}
              inert={(!isDesktop && mobilePane !== "list") || undefined}
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
                    readingListIds={readingListIds}
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
                    onToggleReadingList={toggleReadingList}
                    onMarkRead={markRead}
                    onMarkAllRead={onMarkAllRead}
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
              aria-hidden={(!isDesktop && mobilePane !== "view") || undefined}
              inert={(!isDesktop && mobilePane !== "view") || undefined}
            >
              <ErrorBoundary label="記事表示">
                <ArticleView {...articleViewProps} />
              </ErrorBoundary>
            </main>
          </ThreePaneLayout>
        </ArticleFilterProvider>
      </ReaderSettingsProvider>
    </ToastProvider>
  );
}
