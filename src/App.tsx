"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FeedSidebar from "./components/feed-sidebar";
import ArticleList from "./components/ArticleList";
import ArticleView from "./components/ArticleView";
import ErrorBoundary from "./components/ErrorBoundary";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import UserSettingsModal from "./components/UserSettingsModal";
import FeedQuickSwitchModal from "./components/FeedQuickSwitchModal";
import SnoozeModal from "./components/SnoozeModal";
import NSFWEyeAnimation from "./components/NSFWEyeAnimation";
import type {
  Article,
  EngagementAction,
  Feed,
  FeedPatchPayload,
  FeedView,
  KeywordFilter,
} from "./types";
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
import { isFeed, isArticle } from "./lib/type-guards";
import { normalizeFilter, matchesKeywordFilter } from "./lib/keyword-filter";
import { isArticleRead } from "./lib/article-filter";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useEngagement } from "./hooks/useEngagement";
import { useRecommendations } from "./hooks/useRecommendations";
import { useColumnResize } from "./hooks/useColumnResize";
import { useSyncedRef } from "./hooks/useSyncedRef";
import { ReaderSettingsProvider, type ReaderSettings } from "./contexts/ReaderSettingsContext";
import { ArticleFilterProvider, type ArticleFilter } from "./contexts/ArticleFilterContext";
import { ToastProvider } from "./contexts/ToastContext";
import LandingPage from "./components/LandingPage";
import BetaRestrictedPage from "./components/BetaRestrictedPage";

export default function App() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { user, betaRestricted, sessionExpired } = useAuth();
  const isOnline = useOnlineStatus();

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
    toast,
    showToast,
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
    galleryMinImageFilter,
    onChangeGalleryMinImageFilter,
  } = useUIState(initialMobilePane);

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
  } = useFeeds(user, showToast);

  const {
    groups: feedGroups,
    createGroup,
    renameGroup,
    setCollapsed: setFeedGroupCollapsed,
    setMuted: setFeedGroupMuted,
    deleteGroup,
    reorderGroup,
  } = useFeedGroups(user, showToast);

  const {
    collections,
    createCollection,
    renameCollection,
    deleteCollection,
    addArticleToCollection,
    removeArticleFromCollection,
  } = useCollections(user, showToast);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

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
    markAllRead,
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
      galleryMinImageFilter,
      onChangeGalleryMinImageFilter,
      ttlDays,
      onChangeTtlDays: setTtlDays,
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
      galleryMinImageFilter,
      onChangeGalleryMinImageFilter,
      ttlDays,
      setTtlDays,
    ],
  );

  // 通信エラーをトーストで通知する。短時間に複数発生しても 1 回に集約（UI ノイズ抑止）。
  useEffect(() => {
    let lastShownAt = 0;
    const unsubscribe = onApiError(({ message }) => {
      const now = Date.now();
      if (now - lastShownAt < 3000) return;
      lastShownAt = now;
      showToast(`通信エラー: ${message}`);
    });
    return unsubscribe;
  }, [showToast]);

  const { recordEngagement } = useEngagement(user);
  const {
    recommendations,
    loading: recommendationsLoading,
    dismiss: dismissRecommendation,
    refresh: refreshRecommendations,
    refreshing: recommendationsRefreshing,
  } = useRecommendations(user);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(() =>
    searchParams.get("feed"),
  );
  // ?feed と ?group は相互排他。片方を選ぶと他方はクリアする設計のため、
  // 両方が URL に含まれていた場合は feed を優先して group を無視する。
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    searchParams.get("feed") ? null : searchParams.get("group"),
  );
  // ?tag は ?feed / ?group と相互排他。feed / group が設定されていれば tag は無視する。
  const [selectedTag, setSelectedTag] = useState<string | null>(() =>
    searchParams.get("feed") || searchParams.get("group") ? null : searchParams.get("tag"),
  );
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  // モーダル・ポップアップ表示中はリサイズバーを無効化する（Issue #81）
  const hasOpenPopup = useHasOpenPopup();
  // URL から復元すべき記事 ID（記事ロード完了後に解決）
  const pendingArticleIdRef = useRef<string | null>(searchParams.get("article"));

  // 選択状態を URL クエリパラメータに同期（リロード復元用）
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedFeedId) params.set("feed", selectedFeedId);
    if (selectedGroupId) params.set("group", selectedGroupId);
    if (selectedTag && !selectedFeedId && !selectedGroupId) params.set("tag", selectedTag);
    if (selectedArticle) params.set("article", selectedArticle.id);
    const search = params.toString();
    router.replace(search ? `/?${search}` : "/");
  }, [selectedFeedId, selectedGroupId, selectedTag, selectedArticle, router]);

  // 記事ロード完了後に URL の article パラメータを復元
  useEffect(() => {
    if (!pendingArticleIdRef.current || articles.length === 0) return;
    const article = articles.find((a) => a.id === pendingArticleIdRef.current);
    if (article) {
      setSelectedArticle(article);
    }
    // 記事が見つかった場合も見つからなかった場合も、ロード済みならクリアする
    // クリアしないとポーリング毎に古い ID を検索し続けてしまう
    pendingArticleIdRef.current = null;
  }, [articles]);

  // globalFilter に引っかかった記事（フィルターで非表示になる記事）を自動的に既読にする。
  // これにより未読カウントや未読フィルターに除外記事が混入するのを防ぐ。
  useEffect(() => {
    if (!globalFilter) return;
    const normalized = normalizeFilter(globalFilter);
    const ids = articles.filter((a) => !matchesKeywordFilter(a, normalized)).map((a) => a.id);
    if (ids.length > 0) markBulkRead(ids);
  }, [articles, globalFilter, markBulkRead]);

  const totalUnread = useMemo(
    () => articles.filter((a) => !isArticleRead(a, readIds, readBeforeTimestamp)).length,
    [articles, readIds, readBeforeTimestamp],
  );

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) RSS Reader` : "RSS Reader";
    updateFaviconBadge(totalUnread).catch(() => {});
  }, [totalUnread]);

  const patchFeed = useCallback(
    async (id: string, body: FeedPatchPayload): Promise<Feed | null> => {
      const res = await apiFetch(`/api/feeds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      return isFeed(data) ? data : null;
    },
    [],
  );

  const applyFeedPatch = useCallback(
    async (id: string, patch: FeedPatchPayload): Promise<Feed | null> => {
      const updated = await patchFeed(id, patch);
      if (updated) updateFeed(updated);
      return updated;
    },
    [patchFeed, updateFeed],
  );

  const toggleNsfwFeed = useCallback(
    (feed: Feed) => applyFeedPatch(feed.id, { nsfw: !feed.nsfw }),
    [applyFeedPatch],
  );

  const togglePriorityFeed = useCallback(
    (feed: Feed) => applyFeedPatch(feed.id, { priority: feed.priority === "high" ? null : "high" }),
    [applyFeedPatch],
  );

  const setCategoryFeed = useCallback(
    async (feed: Feed, category: string | null) => {
      await applyFeedPatch(feed.id, { category });
    },
    [applyFeedPatch],
  );

  const setGroupFeed = useCallback(
    async (feed: Feed, groupId: string | null) => {
      await applyFeedPatch(feed.id, { groupId });
    },
    [applyFeedPatch],
  );

  const muteFeed = useCallback(
    async (feed: Feed, mutedUntil: string | null) => {
      await applyFeedPatch(feed.id, { mutedUntil });
    },
    [applyFeedPatch],
  );

  const setFeedView = useCallback(
    async (feed: Feed, view: FeedView | null) => {
      await applyFeedPatch(feed.id, { view });
    },
    [applyFeedPatch],
  );

  const saveFilter = useCallback(
    async (feedId: string, filter: KeywordFilter | null) => {
      const updated = await applyFeedPatch(feedId, { filter });
      if (!updated) throw new Error("フィルターの保存に失敗しました");
    },
    [applyFeedPatch],
  );

  function onFeedDeleted(id: string) {
    removeFeed(id);
    if (selectedFeedId === id) {
      setSelectedFeedId(null);
      setSelectedArticle(null);
    }
  }

  // 削除されたグループが選択中の場合は解除する
  useEffect(() => {
    if (!selectedGroupId) return;
    if (!feedGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [selectedGroupId, feedGroups]);

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
          showToast(raw.error ?? "保存に失敗しました");
          return;
        }
        if (!isArticle(raw)) {
          showToast("保存に失敗しました");
          return;
        }
        prependArticle(raw);
        if (mode === "bookmark") {
          toggleBookmark(raw.id);
          showToast("ブックマークに追加しました");
        } else {
          toggleReadingList(raw.id);
          showToast("後で読むに追加しました");
        }
      } catch {
        showToast("保存に失敗しました");
      }
    },
    [prependArticle, toggleBookmark, toggleReadingList, showToast],
  );

  const nsfwFeedIds = useMemo(() => new Set(feeds.filter((f) => f.nsfw).map((f) => f.id)), [feeds]);

  // 選択中グループに所属するフィード ID セット — useFilteredArticles / markBulkRead 等で共有
  const groupFeedIds = useMemo(() => {
    if (!selectedGroupId) return undefined;
    const ids = new Set<string>();
    for (const f of feeds) if (f.groupId === selectedGroupId) ids.add(f.id);
    return ids;
  }, [selectedGroupId, feeds]);

  const mutedFeedIds = useMemo(() => {
    const now = new Date().toISOString();
    const ids = new Set<string>();
    for (const f of feeds) {
      if (f.mutedUntil && f.mutedUntil > now) ids.add(f.id);
    }
    // グループミュート: muted グループに所属するフィードを追加で除外
    const mutedGroupIds = new Set(feedGroups.filter((g) => g.muted).map((g) => g.id));
    if (mutedGroupIds.size > 0) {
      for (const f of feeds) {
        if (f.groupId && mutedGroupIds.has(f.groupId)) ids.add(f.id);
      }
    }
    return ids;
  }, [feeds, feedGroups]);

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

  // フィルター適用後に表示件数が不足している場合、サーバーから過去記事を自動取得する。
  // 未読フィルター等でローカルの記事が枯渇しても、サーバー側に残ページがある限り自動継続する。
  // 初回ロード中・連続3回超えの場合はスキップ（無限ロード防止）。
  const MAX_AUTO_LOAD = 3;
  const autoLoadingRef = useRef(false);
  const autoLoadCountRef = useRef(0);

  // フィード切り替え・フィルター変更時にカウントをリセット
  useEffect(() => {
    autoLoadCountRef.current = 0;
  }, [
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

  useEffect(() => {
    if (hasMore || !feedHasMorePages || autoLoadingRef.current) return;
    if (loadingArticles) return;
    if (autoLoadCountRef.current >= MAX_AUTO_LOAD) return;
    autoLoadingRef.current = true;
    autoLoadCountRef.current += 1;
    handleLoadMoreFeedArticles().finally(() => {
      autoLoadingRef.current = false;
    });
  }, [hasMore, feedHasMorePages, handleLoadMoreFeedArticles, loadingArticles]);

  const listFocusModeRef = useSyncedRef(listFocusMode);

  const selectArticle = useCallback(
    (article: Article) => {
      if (listFocusModeRef.current) toggleFocusMode();
      setSelectedArticle(article);
      markRead(article.id);
      addToHistory(article.id);
      setMobilePane("view");
    },
    [listFocusModeRef, toggleFocusMode, markRead, addToHistory, setMobilePane],
  );

  const articlesRef = useSyncedRef(articles);
  const { handleToggleBookmark, handleToggleReadingList, handleToggleLike } = useMemo(() => {
    function makeHandler(toggle: (id: string) => void, type: EngagementAction) {
      return (id: string) => {
        toggle(id);
        const article = articlesRef.current.find((a) => a.id === id);
        if (article) recordEngagement(id, article.feedHash, type);
      };
    }
    return {
      handleToggleBookmark: makeHandler(toggleBookmark, "bookmark"),
      handleToggleReadingList: makeHandler(toggleReadingList, "reading_list"),
      handleToggleLike: makeHandler(toggleLike, "like"),
    };
  }, [articlesRef, toggleBookmark, toggleReadingList, toggleLike, recordEngagement]);

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
    markAllRead,
    toggleBookmark,
    toggleRead,
    toggleReadingList,
    toggleLike,
    showToast,
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
  });

  // ローディング
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
      </div>
    );
  }

  if (betaRestricted) return <BetaRestrictedPage />;

  if (!user) return <LandingPage sessionExpired={sessionExpired} />;

  const articleFilter: ArticleFilter = { ...filterState, onSaveFilter: saveFilter };
  const toastValue = useMemo(() => ({ toast, showToast }), [toast, showToast]);

  return (
    <ToastProvider value={toastValue}>
      <ReaderSettingsProvider value={readerSettings}>
        <ArticleFilterProvider value={articleFilter}>
          <div
            data-layout="root"
            className="relative h-screen font-sans antialiased bg-surface-base text-text-strong lg:grid"
            style={{
              gridTemplateColumns: focusMode
                ? `0px 0px 1fr`
                : listFocusMode
                  ? `0px 1fr 0px`
                  : `${sidebarWidth}px ${listWidth}px 1fr`,
              gridTemplateRows: "100%",
              transition: "grid-template-columns 0.25s ease",
            }}
          >
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

            {/* トースト通知 */}
            {toast && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-[12px] tracking-[0.04em] px-4 py-2 bg-ink text-ink-text rounded-full shadow-lg animate-fade-up pointer-events-none">
                {toast}
              </div>
            )}

            {/* スヌーズ期間選択 */}
            {snoozeTargetId &&
              (() => {
                const article = articles.find((a) => a.id === snoozeTargetId);
                const idx = filtered.findIndex((a) => a.id === snoozeTargetId);
                return (
                  <SnoozeModal
                    articleTitle={article?.title ?? ""}
                    onSnooze={(durationMs) => {
                      snoozeArticle(snoozeTargetId, durationMs);
                      const hours = Math.round(durationMs / (60 * 60 * 1000));
                      showToast(hours < 24 ? `${hours}時間スヌーズ` : "スヌーズ設定");
                      const next = filtered[idx + 1];
                      if (next) setSelectedArticle(next);
                    }}
                    onClose={() => setSnoozeTargetId(null)}
                  />
                );
              })()}
            {/* キーボードショートカット ヘルプ */}
            {showHelp && <KeyboardShortcutsModal onClose={() => setShowHelp(false)} />}
            {/* ユーザー設定 */}
            {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
            {/* フィードクイックスイッチャー */}
            {showFeedSwitcher && (
              <FeedQuickSwitchModal
                feeds={feeds}
                articles={articles}
                readIds={readIds}
                readBeforeTimestamp={readBeforeTimestamp}
                selectedFeedId={selectedFeedId}
                onSelectFeed={setSelectedFeedId}
                onClose={() => setShowFeedSwitcher(false)}
              />
            )}
            {/* NSFW 目が開くアニメーション */}
            {showNSFWAnimation && <NSFWEyeAnimation onComplete={onNSFWAnimationComplete} />}
            {newArticleCount > 0 && !focusMode && !listFocusMode && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-ink text-ink-text text-[12px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] animate-fade-up">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />
                新着記事 {newArticleCount} 件
                <button
                  onClick={dismissNewArticles}
                  className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
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
            {/* フォーカスモード解除ボタン（PC のみ表示。モバイルは単一ペイン表示のため不要） */}
            {(focusMode || listFocusMode) && (
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
            {/* カラムリサイズハンドル (PCのみ、フォーカスモード / 記事一覧フォーカス / ポップアップ表示中は無効) */}
            {!focusMode && !listFocusMode && (
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
              className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== "sidebar" ? "hidden lg:block" : ""}`}
            >
              <ErrorBoundary label="サイドバー">
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
                  onSelectFeed={(id) => {
                    setSelectedFeedId(id);
                    setSelectedGroupId(null);
                    setSelectedTag(null);
                    setSelectedArticle(null);
                    setMobilePane("list");
                    const feed = feeds.find((f) => f.id === id);
                    if (feed?.view === "pictures" || feed?.view === "videos") {
                      onChangeLayout("gallery");
                      setListFocusMode(true);
                    } else {
                      setListFocusMode(false);
                    }
                  }}
                  onSelectGroup={(id) => {
                    setSelectedGroupId(id);
                    setSelectedFeedId(null);
                    setSelectedTag(null);
                    setSelectedArticle(null);
                    setMobilePane("list");
                  }}
                  selectedTag={selectedTag}
                  onSelectTag={(tag) => {
                    setSelectedTag(tag);
                    setSelectedFeedId(null);
                    setSelectedGroupId(null);
                    setSelectedArticle(null);
                    setMobilePane("list");
                  }}
                  articleTagIds={articleTagIds}
                  onFeedAdded={onFeedAdded}
                  onFeedDeleted={onFeedDeleted}
                  onFeedRenamed={updateFeed}
                  onFeedsImported={appendFeeds}
                  onMarkAllRead={markAllRead}
                  onToggleTheme={toggleTheme}
                  onOpenSettings={() => setShowSettings(true)}
                  onOpenHelp={() => setShowHelp(true)}
                  onSaveArticleUrl={onSaveArticleUrl}
                  onRefresh={refreshFeeds}
                  onRetryFeed={retryFeed}
                  onReinferFeed={reinferFeed}
                  refreshing={refreshing}
                  loadingFeeds={loadingFeeds}
                  isOnline={isOnline}
                  pinnedFeedIds={pinnedFeedIds}
                  onTogglePinFeed={togglePinFeed}
                  collapsedCategories={collapsedCategories}
                  onToggleCollapseCategory={toggleCollapseCategory}
                  nsfwMode={nsfwMode}
                  onActivateNsfw={activateNSFW}
                  onDeactivateNsfw={deactivateNSFW}
                  onToggleNsfwFeed={toggleNsfwFeed}
                  onTogglePriorityFeed={togglePriorityFeed}
                  onSetCategoryFeed={setCategoryFeed}
                  feedGroups={feedGroups}
                  onSetGroupFeed={setGroupFeed}
                  onCreateFeedGroup={createGroup}
                  onRenameFeedGroup={renameGroup}
                  onDeleteFeedGroup={deleteGroup}
                  onToggleCollapseFeedGroup={setFeedGroupCollapsed}
                  onToggleMuteFeedGroup={setFeedGroupMuted}
                  onReorderFeedGroup={reorderGroup}
                  onMarkAllReadInGroup={(feedIds) => {
                    // グループ内フィードの記事 ID を 1 パスで集約して markBulkRead に渡す
                    // （feedIds ループで markAllRead を呼ぶと articlesRef を N 回スキャンするのを回避）
                    const feedSet = new Set(feedIds);
                    const ids = articles.filter((a) => feedSet.has(a.feedHash)).map((a) => a.id);
                    if (ids.length > 0) markBulkRead(ids);
                  }}
                  onMuteFeed={muteFeed}
                  onSetFeedView={setFeedView}
                  activeFeedView={activeFeedView}
                  onChangeActiveFeedView={(view) => {
                    // カテゴリ横断表示のため、タブ切替時はフィード・グループ選択を解除する
                    onChangeActiveFeedView(view);
                    setSelectedFeedId(null);
                    setSelectedGroupId(null);
                    setSelectedArticle(null);
                    // 画像/動画カテゴリはギャラリーレイアウトに自動切替 — 全画像/動画の展開表示を期待する仕様
                    // ユーザーが後で手動で別レイアウトを選んだ場合は尊重する（次にカテゴリ切替するまで）
                    if (view === "pictures" || view === "videos") {
                      onChangeLayout("gallery");
                      setListFocusMode(true);
                    } else {
                      setListFocusMode(false);
                    }
                  }}
                  recommendations={recommendations}
                  recommendationsLoading={recommendationsLoading}
                  recommendationsRefreshing={recommendationsRefreshing}
                  onDismissRecommendation={dismissRecommendation}
                  onRefreshRecommendations={refreshRecommendations}
                  onExportMarkdown={(mode) => {
                    const ids = mode === "reading_list" ? readingListIds : bookmarkIds;
                    exportArticlesToMarkdown(articles, ids, feeds, mode);
                  }}
                  onExportNotes={() => {
                    exportNotesToMarkdown(articles, notes, feeds);
                  }}
                  noteCount={Object.keys(notes).length}
                  collections={collections}
                  selectedCollectionId={selectedCollectionId}
                  onSelectCollection={setSelectedCollectionId}
                  onCreateCollection={createCollection}
                  onRenameCollection={renameCollection}
                  onDeleteCollection={deleteCollection}
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
              </ErrorBoundary>
            </div>
            <div
              data-pane="list"
              className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== "list" ? "hidden lg:block" : ""}`}
            >
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
                      if (ids.length > 0) markBulkRead(ids);
                      return;
                    }
                    markAllRead(selectedFeedId);
                    skipRemainingPages(selectedFeedId);
                  }}
                  feedHasMorePages={feedHasMorePages}
                  onLoadMoreFeedArticles={handleLoadMoreFeedArticles}
                  notes={notes}
                  activeFeedView={activeFeedView}
                  listFocusMode={listFocusMode}
                  onToggleListFocusMode={toggleListFocusMode}
                  onGalleryAutoRead={handleGalleryAutoRead}
                />
              </ErrorBoundary>
            </div>
            <div
              data-pane="view"
              className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== "view" ? "hidden lg:block" : ""}`}
            >
              <ErrorBoundary label="記事表示">
                <ArticleView
                  article={selectedArticle}
                  isBookmarked={selectedArticle ? bookmarkIds.has(selectedArticle.id) : false}
                  onToggleBookmark={handleToggleBookmark}
                  isInReadingList={selectedArticle ? readingListIds.has(selectedArticle.id) : false}
                  onToggleReadingList={handleToggleReadingList}
                  isLiked={selectedArticle ? likeIds.has(selectedArticle.id) : false}
                  onToggleLike={handleToggleLike}
                  onEngagement={recordEngagement}
                  onMobileBack={() => setMobilePane("list")}
                  prevArticle={prevArticle}
                  nextArticle={nextArticle}
                  onSelectPrev={prevArticle ? () => selectArticle(prevArticle) : undefined}
                  onSelectNext={nextArticle ? () => selectArticle(nextArticle) : undefined}
                  feeds={feeds}
                  onSnooze={snoozeArticle}
                  note={selectedArticle ? notes[selectedArticle.id] : undefined}
                  onSetNote={setNote}
                  onDeleteNote={deleteNote}
                  onAutoMarkRead={markRead}
                  tags={selectedArticle ? (articleTagIds[selectedArticle.id] ?? []) : []}
                  allTags={articleTagIds}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  onSetArticleTags={setArticleTags}
                  onClearArticleTags={clearArticleTags}
                  collections={collections}
                  onAddToCollection={addArticleToCollection}
                  onRemoveFromCollection={removeArticleFromCollection}
                  onCreateCollection={createCollection}
                />
              </ErrorBoundary>
            </div>
          </div>
        </ArticleFilterProvider>
      </ReaderSettingsProvider>
    </ToastProvider>
  );
}
