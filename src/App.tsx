"use client";

import { useCallback, useMemo, useState } from "react";
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
import ColumnResizeHandles from "./components/ColumnResizeHandles";
import FocusModeExitButton from "./components/FocusModeExitButton";
import A11yHelpers from "./components/A11yHelpers";
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
import { usePWAInstall } from "./hooks/usePWAInstall";
import { usePinnedAndCategories } from "./hooks/usePinnedAndCategories";
import { useHasOpenPopup } from "./hooks/usePopupLock";
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
import { useArticleSelection } from "./hooks/useArticleSelection";
import { useAppModalState } from "./hooks/useAppModalState";
import { useSaveArticleUrl } from "./hooks/useSaveArticleUrl";
import { useSnoozeHandler } from "./hooks/useSnoozeHandler";
import { useDocumentTitleBadge } from "./hooks/useDocumentTitleBadge";
import { useDesktopMediaQuery } from "./hooks/useDesktopMediaQuery";
import { useApiErrorToast } from "./hooks/useApiErrorToast";
import { useOnlineRecoveryToast } from "./hooks/useOnlineRecoveryToast";
import { useGalleryAutoReadTracking } from "./hooks/useGalleryAutoReadTracking";
import { useFeedPagination } from "./hooks/useFeedPagination";
import { useArticleNavigation } from "./hooks/useArticleNavigation";
import { useConfirm } from "./hooks/useConfirm";
import { useMarkAllRead } from "./hooks/useMarkAllRead";
import { useTotalUnreadCount } from "./hooks/useTotalUnreadCount";
import { useFeedSidebarActions } from "./hooks/useFeedSidebarActions";
import { useArticleViewProps } from "./hooks/useArticleViewProps";
import { useDigestFeedOrder } from "./hooks/useDigestFeedOrder";
import ConfirmModal from "./components/ConfirmModal";
import ThreePaneLayout from "./components/ThreePaneLayout";
import { ReaderSettingsProvider } from "./contexts/ReaderSettingsContext";
import { useReaderSettingsValue } from "./hooks/useReaderSettingsValue";
import { ArticleFilterProvider, type ArticleFilter } from "./contexts/ArticleFilterContext";
import { ToastProvider } from "./contexts/ToastContext";
import { FeedSidebarProvider } from "./contexts/FeedSidebarContext";
import { TtsAdapterProvider } from "./contexts/TtsAdapterContext";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import ToastContainer from "./components/ToastContainer";
import { useToastState } from "./hooks/useToast";
import { AppLandingState } from "./components/AppLandingState";

import SkeletonSidebar from "./components/SkeletonSidebar";
import SkeletonArticleList from "./components/SkeletonArticleList";
import { useMobilePane, getMobilePaneTransform } from "./hooks/useMobilePane";

export default function App() {
  const searchParams = useSearchParams();
  const { user, betaRestricted, sessionExpired } = useAuth();
  const isOnline = useOnlineStatus();

  const initialMobilePane = searchParams.get("article")
    ? "view"
    : searchParams.get("feed")
      ? "list"
      : "sidebar";

  const isDesktop = useDesktopMediaQuery();

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
    autoSummarize,
    toggleAutoSummarize,
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
  // #675 Phase 1b: TTS adapter を 1 箇所で生成して Provider 経由で配下に注入。
  // 配下で `useTtsAdapter()` を呼ぶ全 consumer (記事ヘッダー TTS / 設定モーダル voice 選択) で
  // 同じ isPlaying / rate / voice state を共有する。
  const ttsAdapter = useSpeechSynthesis();
  const ttsSupported = ttsAdapter.supported;

  const {
    showHelp,
    setShowHelp,
    showFeedSwitcher,
    setShowFeedSwitcher,
    showSettings,
    setShowSettings,
  } = useAppModalState();

  const toast = useToastState();
  const { confirm, confirmModalProps } = useConfirm();
  // キーボードショートカット用のシンプルな confirm ラッパー（メッセージのみ）
  const confirmMessage = useCallback(
    (message: string) => confirm({ title: "確認", message }),
    [confirm],
  );

  useOnlineRecoveryToast(isOnline, toast);

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

  const readerSettings = useReaderSettingsValue({
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
    autoSummarize,
    toggleAutoSummarize,
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
  });

  useApiErrorToast(toast);

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

  const totalUnread = useTotalUnreadCount(articles, readIds, readBeforeTimestamp);

  useDocumentTitleBadge(totalUnread);

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

  const onSaveArticleUrl = useSaveArticleUrl({
    prependArticle,
    toggleBookmark,
    toggleReadingList,
    toast,
  });

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

  const { galleryAutoReadIds, handleGalleryAutoRead } = useGalleryAutoReadTracking({
    selectedFeedId,
    selectedGroupId,
    activeFeedView,
    layout,
  });

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

  const { prevArticle, nextArticle } = useArticleNavigation(selectedArticle, filtered);

  const { feedHasMorePages, handleLoadMoreFeedArticles } = useFeedPagination({
    selectedFeedId,
    feeds,
    loadedFeedPages,
    loadMoreFeedArticles,
    loadMoreAllFeedsArticles,
    notifyArticlesAdded,
  });

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

  // #684: 記事一覧アンカー用トリガーカウンタ。`.` キーまたは UI ボタンで increment して
  //       ArticleList に渡し、useEffect で「選択中記事へ強制スクロール」を再実行する。
  const [anchorTrigger, setAnchorTrigger] = useState(0);
  const anchorListToSelected = useCallback(() => setAnchorTrigger((c) => c + 1), []);

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
    anchorListToSelected,
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

  const { snoozeArticleTitle, handleSnooze } = useSnoozeHandler({
    snoozeTargetId,
    articles,
    filtered,
    snoozeArticle,
    setSelectedArticle,
    toast,
  });

  // ロード中 / ベータ制限 / 未ログイン の早期 return パスを集約 (#650 Step 2)
  const landingNode = AppLandingState({ user, betaRestricted });
  if (landingNode) return landingNode;
  // landingNode が null の時点で user は確実にログイン済 (TypeScript narrowing 用)
  if (!user) return null;

  const articleFilter: ArticleFilter = { ...filterState, onSaveFilter: saveFilter };

  return (
    <ToastProvider value={toast}>
      <TtsAdapterProvider value={ttsAdapter}>
        <ReaderSettingsProvider value={readerSettings}>
          <ArticleFilterProvider value={articleFilter}>
            <ThreePaneLayout
              sidebarWidth={sidebarWidth}
              listWidth={listWidth}
              listFocusMode={listFocusMode}
            >
              <A11yHelpers announcement={articleAnnouncement} />
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
              <FocusModeExitButton listFocusMode={listFocusMode} onExit={exitFocusMode} />
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
              <ColumnResizeHandles
                listFocusMode={listFocusMode}
                hasOpenPopup={hasOpenPopup}
                sidebarWidth={sidebarWidth}
                listWidth={listWidth}
                onResizeStart={handleResizeStart}
                onResetWidth={resetWidth}
              />
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
                      anchorTrigger={anchorTrigger}
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
      </TtsAdapterProvider>
    </ToastProvider>
  );
}
