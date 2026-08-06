"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppOverlays } from "./AppOverlays";
import { AppSidebarPane } from "./AppSidebarPane";
import { AppListPane } from "./AppListPane";
import { AppViewPane } from "./AppViewPane";
import { useAuth } from "../hooks/useAuth";
import { useFeeds } from "../hooks/useFeeds";
import { useFeedGroups } from "../hooks/useFeedGroups";
import { useCollections } from "../hooks/useCollections";
import { useReadState } from "../hooks/useReadState";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { useFilteredArticles } from "../hooks/useFilteredArticles";
import { useReadingHistory } from "../hooks/useReadingHistory";
import { useThemePreference } from "../hooks/useThemePreference";
import { useLayoutSettings } from "../hooks/useLayoutSettings";
import { useAutoReadSettings } from "../hooks/useAutoReadSettings";
import { useAccessibilitySettings } from "../hooks/useAccessibilitySettings";
import { useNSFWMode } from "../hooks/useNSFWMode";
import { useFocusMode } from "../hooks/useFocusMode";
import { useAutoReadMode } from "../hooks/useAutoReadMode";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { usePinnedAndCategories } from "../hooks/usePinnedAndCategories";
import { useHasOpenPopup } from "../hooks/usePopupLock";
import { useGlobalFilterAutoRead } from "../hooks/useGlobalFilterAutoRead";
import { useAutoLoadMoreArticles } from "../hooks/useAutoLoadMoreArticles";
import { useEngagementToggles } from "../hooks/useEngagementToggles";
import { useFeedSelection } from "../hooks/useFeedSelection";
import { useModalState } from "../hooks/useModalState";
import { useFeedFilters } from "../hooks/useFeedFilters";
import { useFeedPatch } from "../hooks/useFeedPatch";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useEngagement } from "../hooks/useEngagement";
import { useRecommendations } from "../hooks/useRecommendations";
import { useColumnResize } from "../hooks/useColumnResize";
import { useArticleSelection } from "../hooks/useArticleSelection";
import { useAppModalState } from "../hooks/useAppModalState";
import { useSaveArticleUrl } from "../hooks/useSaveArticleUrl";
import { useSnoozeHandler } from "../hooks/useSnoozeHandler";
import { useDocumentTitleBadge } from "../hooks/useDocumentTitleBadge";
import { useDesktopMediaQuery } from "../hooks/useDesktopMediaQuery";
import { useApiErrorToast } from "../hooks/useApiErrorToast";
import { useOnlineRecoveryToast } from "../hooks/useOnlineRecoveryToast";
import { useGalleryAutoReadTracking } from "../hooks/useGalleryAutoReadTracking";
import { useFeedPagination } from "../hooks/useFeedPagination";
import { useArticleNavigation } from "../hooks/useArticleNavigation";
import { useConfirm } from "../hooks/useConfirm";
import { useMarkAllRead } from "../hooks/useMarkAllRead";
import { useArticleUnreadStats } from "../hooks/useArticleUnreadStats";
import { UnreadStatsProvider } from "../contexts/UnreadStatsContext";
import { OgpCacheProvider } from "../contexts/OgpCacheContext";
import { useOgpCache } from "../hooks/useOgpCache";
import { useCollectionArticleIds } from "../hooks/useCollectionArticleIds";
import { useFeedSidebarActions } from "../hooks/useFeedSidebarActions";
import { useArticleViewProps } from "../hooks/useArticleViewProps";
import { useDigestFeedOrder } from "../hooks/useDigestFeedOrder";
import ThreePaneLayout from "./ThreePaneLayout";
import AppProviders from "./AppProviders";
import { useReaderSettingsValue } from "../hooks/useReaderSettingsValue";
import { type ArticleFilter } from "../contexts/ArticleFilterContext";
import { type Article } from "../types";
import { useBackgroundAudio } from "../hooks/useBackgroundAudio";
import { useMediaSession } from "../hooks/useMediaSession";
import { useSyncedRef } from "../hooks/useSyncedRef";
import type { TtsAdapter, TtsEngineId } from "../lib/tts-adapter";
import { useToastState } from "../hooks/useToast";
import { AppLandingState } from "./AppLandingState";

import { computeEffectiveReadBeforeCutoff } from "../lib/read-state-prune";
import { useMobilePane } from "../hooks/useMobilePane";

/**
 * Piper / Web Speech engine 両対応の availableEngines。AppShell 内で固定参照を共有して
 * ttsAdapter useMemo の identity を engine 切替以外で動かさない。
 */
const AVAILABLE_ENGINES: readonly TtsEngineId[] = ["web-speech", "piper"];

interface AppShellProps {
  /** 現在選択中の TTS engine (App.tsx で `useTtsEngineSetting` から取得) */
  engine: TtsEngineId;
  /** engine 永続化 setter (App.tsx で `useTtsEngineSetting` から取得) */
  setEngine: (engine: TtsEngineId) => void;
  /** Web Speech engine の adapter (App.tsx で `useSpeechSynthesis()` で生成) */
  speechSynAdapter: TtsAdapter;
  /** Piper engine の adapter (App.tsx で `PiperEngineHost` の render prop callback から取得) */
  piperAdapter: TtsAdapter;
}

export default function AppShell({
  engine,
  setEngine: setTtsEngine,
  speechSynAdapter,
  piperAdapter,
}: AppShellProps) {
  const searchParams = useSearchParams();
  const { user, betaRestricted, sessionExpired } = useAuth();
  const isOnline = useOnlineStatus();

  const initialMobilePane = searchParams.get("article")
    ? "view"
    : searchParams.get("feed")
      ? "list"
      : "sidebar";

  const isDesktop = useDesktopMediaQuery();

  const { theme, toggleTheme, setTheme } = useThemePreference();
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
    galleryAutoScrollSpeed,
    onChangeGalleryAutoScrollSpeed,
    galleryPageSize,
    onChangeGalleryPageSize,
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
    autoAiBrowserOnly,
    toggleAutoAiBrowserOnly,
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

  // #674 Phase 2c (closes #753): engine 設定値で piper / web-speech adapter を切替える。
  // `engine === "piper"` のときだけ piperAdapter (PiperEngineHost の usePiperTts({ enabled: true })
  // で生成された TtsAdapter) を採用し、それ以外では speechSynAdapter (useSpeechSynthesis) を採用する。
  // PiperEngineHost には `enabled={engine === "piper"}` が渡るため、Web Speech 選択中は wasm load /
  // voices fetch / speak を完全 skip (リソース節約)。
  const baseAdapter = engine === "piper" ? piperAdapter : speechSynAdapter;
  // #675 Phase 1b: TTS adapter を 1 箇所で合成して Provider 経由で配下に注入。
  // 配下で `useTtsAdapter()` を呼ぶ全 consumer (記事ヘッダー TTS / 設定モーダル voice 選択) で
  // 同じ isPlaying / rate / voice state を共有する。
  const ttsAdapter = useMemo(
    () => ({
      ...baseAdapter,
      setEngine: setTtsEngine,
      availableEngines: AVAILABLE_ENGINES,
    }),
    [baseAdapter, setTtsEngine],
  );
  const ttsSupported = ttsAdapter.supported;

  // #674 Phase 2c (closes #753): engine 切替時、直前 engine の adapter で再生中なら停止する
  // (ユーザー判断: 「engine 切替時の中断 OK」)。adapter インスタンスは useSyncedRef で最新値を
  // 参照し、useEffect の deps は engine のみに絞る (毎 render の adapter identity 変動で
  // 再発火させない)。
  const piperAdapterRef = useSyncedRef(piperAdapter);
  const speechSynAdapterRef = useSyncedRef(speechSynAdapter);
  const prevEngineRef = useRef(engine);
  useEffect(() => {
    if (prevEngineRef.current === engine) return;
    const prev = prevEngineRef.current;
    if (prev === "piper") {
      piperAdapterRef.current.stop();
    } else {
      speechSynAdapterRef.current.stop();
    }
    prevEngineRef.current = engine;
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // #745 Phase B: TTS 再生中 (or 一時停止中) の間、WebAudio の無音 oscillator を継続。
  // これでスマホブラウザは「メディア再生中」と認識し、speechSynthesis のバックグラウンド休眠を回避できる。
  useBackgroundAudio(ttsAdapter.isPlaying || ttsAdapter.isPaused);

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
  const { sidebarWidth, listWidth, handleResizeStart, resetWidth, nudgeWidth } = useColumnResize();

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
    mergeFeedFields,
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
    addArticlesToCollection,
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
    setTheme,
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
    autoAiBrowserOnly,
    toggleAutoAiBrowserOnly,
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
    galleryAutoScrollSpeed,
    onChangeGalleryAutoScrollSpeed,
    galleryPageSize,
    onChangeGalleryPageSize,
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
    topics: recommendationTopics,
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
    selectFeedClearingArticle,
    clearFeedGroupArticleSelection,
  } = useFeedSelection(articles, feedGroups);

  // #745 Phase C 案 A: MediaSession API で iOS Safari lockscreen / Android 通知センターに
  // 記事タイトル + play/pause/stop コントロールを表示。speechSynthesis が OS 観点で
  // 「メディア再生中」と認識されてバックグラウンド休眠を回避する canonical solution。
  // 既存 useBackgroundAudio (WebAudio 無音 oscillator) は defense in depth として継続。
  useMediaSession({ article: selectedArticle, ttsAdapter });

  const {
    snoozeTargetId,
    setSnoozeTargetId,
    snoozeReturnFocusEl,
    setSnoozeReturnFocusEl,
    articleAnnouncement,
    setArticleAnnouncement,
  } = useModalState();

  // #748: snooze trigger 時に直前の活性要素 (article 内 menu / shortcut key 発火元) を snapshot し、
  // article が DOM から消えても fallback 復元先を確保する。
  const handleShowSnoozeMenu = useCallback(
    (id: string | null) => {
      if (id) setSnoozeReturnFocusEl(document.activeElement as HTMLElement | null);
      setSnoozeTargetId(id);
    },
    [setSnoozeTargetId, setSnoozeReturnFocusEl],
  );

  const hasOpenPopup = useHasOpenPopup();

  useGlobalFilterAutoRead(articles, globalFilter, readIds, markBulkRead);

  // #702: useTotalUnreadCount + useSidebarFeeds 内の独自 articles scan を統合。
  // ここで 1 回だけ計算 → UnreadStatsProvider 経由で <FeedSidebar> や
  // useDocumentTitleBadge に共有することで二重 scan を解消する。
  const effectiveReadBeforeTimestamp = useMemo(
    () => computeEffectiveReadBeforeCutoff(readBeforeTimestamp, ttlDays, Date.now()),
    [readBeforeTimestamp, ttlDays],
  );

  const unreadStats = useArticleUnreadStats(articles, readIds, effectiveReadBeforeTimestamp);
  const { totalUnread } = unreadStats;

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
  } = useFeedPatch(mergeFeedFields, toast.error);

  // フィード削除時、削除対象が現在選択中なら選択も解除する (#650 Step 1u)。
  // selectFeedClearingArticle(null) は useFeedSelection が提供するアトミック解除操作。
  const onFeedDeleted = useCallback(
    (id: string) => {
      removeFeed(id);
      if (selectedFeedId === id) selectFeedClearingArticle(null);
    },
    [removeFeed, selectedFeedId, selectFeedClearingArticle],
  );

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

  const collectionArticleIds = useCollectionArticleIds(selectedCollectionId, collections);

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
    readBeforeTimestamp: effectiveReadBeforeTimestamp,
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
    pageSize: galleryPageSize,
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
    toggleNoteOnly,
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
    setSelectedFeedIdNull: clearFeedGroupArticleSelection,
    dismissRecommendation,
    refreshRecommendations,
    setSelectedCollectionId,
    createCollection,
    renameCollection,
    deleteCollection,
    collectionArticleIds: collectionArticleIds ?? new Set<string>(),
    selectedCollectionName: collections.find((c) => c.id === selectedCollectionId)?.name ?? null,
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
  // #722: 空状態 CTA「フィードを追加」用の trigger counter
  const [openFeedAddTrigger, setOpenFeedAddTrigger] = useState(0);
  const openFeedAddModal = useCallback(() => setOpenFeedAddTrigger((c) => c + 1), []);

  const onMobileBackToSidebar = useCallback(() => setMobilePane("sidebar"), [setMobilePane]);
  const onContextMenuSnoozeArticle = useCallback(
    (article: Article) => handleShowSnoozeMenu(article.id),
    [handleShowSnoozeMenu],
  );
  const pushApi = useMemo(
    () => ({
      supported: pushSupported,
      subscribed: pushSubscribed,
      loading: pushLoading,
      error: pushError,
      onToggle: togglePush,
      onSendTest: sendPushTest,
    }),
    [pushSupported, pushSubscribed, pushLoading, pushError, togglePush, sendPushTest],
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
    onSelectFeed: selectFeedClearingArticle,
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
    noteOnly,
    toggleNoteOnly,
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
    onShowSnoozeMenu: handleShowSnoozeMenu,
    onShowFeedSwitcher: () => setShowFeedSwitcher(true),
    onArticleAnnounce: setArticleAnnouncement,
    confirm: confirmMessage,
    autoMode,
    toggleAutoMode,
    ttsSupported,
    cycleTtsRate: ttsAdapter.cycleRate,
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
    addArticlesToCollection,
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

  // #808 Phase 3a: useOgpCache を AppShell 階層 (ArticleList と ArticleContentBody の
  // 共通祖先) で 1 度だけ呼んで OgpCacheProvider に注入。これで ArticleList 側 (gallery
  // OGP) と ArticleContentBody 側 (本文リンクプレビュー、Phase 3b で統合済) が
  // 同じ cache instance を参照可能になる (state 分裂を構造的に防止)。
  // Phase 3b 完了: useContentLinkPreviews.ts:102,156 が useOgpCacheContext 経由で
  // getEntry / cacheOgpEntry を呼ぶ実装になっており、cache hit 率向上 + 重複 fetch 統合済。
  //
  // #892 (master 既存 React runtime bug fix): useOgpCache は AppLandingState() / !user
  // の早期 return より「前」で呼ぶ必要がある。auth loading 中 (landingNode != null) は
  // 早期 return して useOgpCache が呼ばれず、auth 完了 (landingNode == null) で
  // useOgpCache が呼ばれる。render 間で hook 呼出数が変動して
  // `Rendered more hooks than during the previous render` を発火させる
  // Rules of Hooks 違反。hook は早期 return より上で無条件に呼ぶことで構造的に解消。
  const ogpCacheStore = useOgpCache(filterState.visible);

  // #892 Rules of Hooks 修正: articleFilter の useMemo は早期 return より前で呼ぶ必要がある。
  // useOgpCache と同様に、hook は render 間で呼出数が一定でなければならない。
  const articleFilter: ArticleFilter = useMemo(
    () => ({ ...filterState, onSaveFilter: saveFilter }),
    [filterState, saveFilter],
  );

  // ロード中 / ベータ制限 / 未ログイン の早期 return パスを集約 (#650 Step 2)
  const landingNode = AppLandingState({ user, betaRestricted });
  if (landingNode) return landingNode;
  // landingNode が null の時点で user は確実にログイン済 (TypeScript narrowing 用)
  if (!user) return null;

  return (
    <AppProviders
      toast={toast}
      ttsAdapter={ttsAdapter}
      readerSettings={readerSettings}
      articleFilter={articleFilter}
    >
      <UnreadStatsProvider value={unreadStats}>
        <OgpCacheProvider value={ogpCacheStore}>
          <ThreePaneLayout
            sidebarWidth={sidebarWidth}
            listWidth={listWidth}
            listFocusMode={listFocusMode}
          >
            <AppOverlays
              articleAnnouncement={articleAnnouncement}
              isOnline={isOnline}
              hasPendingChanges={hasPendingChanges}
              confirmModalProps={confirmModalProps}
              appModalsProps={{
                sessionExpired,
                snoozeTargetId,
                snoozeArticleTitle,
                onSnooze: handleSnooze,
                onSnoozeClose: () => setSnoozeTargetId(null),
                snoozeReturnFocusEl,
                showHelp,
                onHelpClose: () => setShowHelp(false),
                showSettings,
                onSettingsClose: () => setShowSettings(false),
                showFeedSwitcher,
                feeds,
                articles,
                setNote,
                bookmarkIds,
                readingListIds,
                toggleBookmark,
                toggleReadingList,
                collections,
                addArticlesToCollection,
                selectedFeedId,
                onSelectFeed: setSelectedFeedId,
                onFeedSwitcherClose: () => setShowFeedSwitcher(false),
              }}
              showNSFWAnimation={showNSFWAnimation}
              onNSFWAnimationComplete={onNSFWAnimationComplete}
              newArticleCount={newArticleCount}
              focusMode={focusMode}
              listFocusMode={listFocusMode}
              dismissNewArticles={dismissNewArticles}
              exitFocusMode={exitFocusMode}
              articleViewProps={articleViewProps}
              articleDetailOverlayOpen={articleDetailOverlayOpen}
              closeArticleDetailOverlay={closeArticleDetailOverlay}
              hasOpenPopup={hasOpenPopup}
              sidebarWidth={sidebarWidth}
              listWidth={listWidth}
              onResizeStart={handleResizeStart}
              resetWidth={resetWidth}
              nudgeWidth={nudgeWidth}
            />
            <AppSidebarPane
              mobilePane={mobilePane}
              isDesktop={isDesktop}
              loadingFeeds={loadingFeeds}
              feedsEmpty={feeds.length === 0}
              feedSidebarActions={feedSidebarActions}
              feedSidebarProps={{
                feeds,
                articles,
                readIds,
                readBeforeTimestamp,
                bookmarkCount,
                readingListCount,
                likeCount,
                historyCount,
                selectedFeedId,
                selectedGroupId,
                user,
                theme,
                selectedTag,
                articleTagIds,
                refreshing,
                loadingFeeds,
                isOnline,
                pinnedFeedIds,
                collapsedCategories,
                nsfwMode,
                feedGroups,
                totalUnread,
                activeFeedView,
                recommendations,
                recommendationTopics,
                recommendationsLoading,
                recommendationsRefreshing,
                recommendationsError,
                noteCount: Object.keys(notes).length,
                collections,
                collectionsLoadError,
                onRetryCollections: retryCollections,
                selectedCollectionId,
                install,
                loadError: feedLoadError ? "フィードの読み込みに失敗しました" : null,
                onRetry: retryFeedList,
                push: pushApi,
                openFeedAddTrigger,
              }}
            />
            <AppListPane
              mobilePane={mobilePane}
              isDesktop={isDesktop}
              loadingFeeds={loadingFeeds}
              feedsEmpty={feeds.length === 0}
              articleListProps={{
                feeds,
                readIds,
                readBeforeTimestamp,
                bookmarkIds,
                readingListIds,
                selectedArticleId: selectedArticle?.id ?? null,
                selectedFeedId,
                layout,
                loading: loadingArticles,
                fetchError,
                onRetry: retryInitialLoad,
                onChangeLayout,
                onMobileBack: onMobileBackToSidebar,
                onSelectArticle: selectArticle,
                onToggleRead: toggleRead,
                onToggleBookmark: toggleBookmark,
                onToggleReadingList: toggleReadingList,
                onMarkRead: markRead,
                onMarkAllRead,
                feedHasMorePages,
                onLoadMoreFeedArticles: handleLoadMoreFeedArticles,
                notes,
                activeFeedView,
                listFocusMode,
                onToggleListFocusMode: toggleListFocusMode,
                onGalleryAutoRead: handleGalleryAutoRead,
                duplicateInfo,
                anchorTrigger,
                onAddFeed: openFeedAddModal,
                onSnoozeArticle: snoozeArticle,
                onContextMenuSnooze: onContextMenuSnoozeArticle,
                onAddTag: addTag,
              }}
            />
            <AppViewPane
              mobilePane={mobilePane}
              isDesktop={isDesktop}
              articleViewProps={articleViewProps}
            />
          </ThreePaneLayout>
        </OgpCacheProvider>
      </UnreadStatsProvider>
    </AppProviders>
  );
}
