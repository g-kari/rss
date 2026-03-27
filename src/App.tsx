"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FeedSidebar from "./components/FeedSidebar";
import ArticleList from "./components/ArticleList";
import ArticleView from "./components/ArticleView";
import ErrorBoundary from "./components/ErrorBoundary";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import type { Article } from "./types";
import { useAuth } from "./hooks/useAuth";
import { useFeeds } from "./hooks/useFeeds";
import { useReadState } from "./hooks/useReadState";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { useFilteredArticles } from "./hooks/useFilteredArticles";
import { useReadingHistory } from "./hooks/useReadingHistory";
import { useUIState } from "./hooks/useUIState";
import { updateFaviconBadge } from "./lib/favicon";
import { useOnlineStatus } from "./hooks/useOnlineStatus";

export default function App() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { user, betaRestricted } = useAuth();
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
    layout,
    onChangeLayout,
    pinnedFeedIds,
    togglePinFeed,
    toast,
    showToast,
    mobilePane,
    setMobilePane,
    install,
    showHelp,
    setShowHelp,
  } = useUIState(initialMobilePane);

  const {
    feeds,
    articles,
    loadingArticles,
    refreshing,
    newArticleCount,
    loadedFeedPages,
    onFeedAdded,
    prependArticle,
    removeFeed,
    updateFeed,
    replaceFeeds,
    refreshFeeds,
    retryFeed,
    dismissNewArticles,
    loadMoreFeedArticles,
  } = useFeeds(user, showToast);
  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    loading: pushLoading,
    error: pushError,
    toggle: togglePush,
  } = usePushNotifications(user);

  const {
    readIds,
    bookmarkIds,
    readingListIds,
    markRead,
    markAllRead,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
  } = useReadState(user, articles);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(() =>
    searchParams.get("feed"),
  );
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  // URL から復元すべき記事 ID（記事ロード完了後に解決）
  const pendingArticleIdRef = useRef<string | null>(searchParams.get("article"));

  // 選択状態を URL クエリパラメータに同期（リロード復元用）
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedFeedId) params.set("feed", selectedFeedId);
    if (selectedArticle) params.set("article", selectedArticle.id);
    const search = params.toString();
    router.replace(search ? `/?${search}` : "/");
  }, [selectedFeedId, selectedArticle, router]);

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

  const totalUnread = useMemo(
    () => articles.filter((a) => !readIds.has(a.id)).length,
    [articles, readIds],
  );

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) RSS Reader` : "RSS Reader";
    updateFaviconBadge(totalUnread).catch(() => {});
  }, [totalUnread]);

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
        const res = await fetch("/api/articles/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = (await res.json()) as Article & { error?: string };
        if (!res.ok) {
          showToast(data.error ?? "保存に失敗しました");
          return;
        }
        prependArticle(data);
        if (mode === "bookmark") {
          toggleBookmark(data.id);
          showToast("ブックマークに追加しました");
        } else {
          toggleReadingList(data.id);
          showToast("後で読むに追加しました");
        }
      } catch {
        showToast("保存に失敗しました");
      }
    },
    [prependArticle, toggleBookmark, toggleReadingList, showToast],
  );

  const { historyIds, historyOrder, addToHistory } = useReadingHistory();

  const bookmarkCount = useMemo(
    () => articles.filter((a) => bookmarkIds.has(a.id)).length,
    [articles, bookmarkIds],
  );

  const readingListCount = useMemo(
    () => articles.filter((a) => readingListIds.has(a.id)).length,
    [articles, readingListIds],
  );

  const historyCount = useMemo(
    () => articles.filter((a) => historyIds.has(a.id)).length,
    [articles, historyIds],
  );

  const {
    filtered,
    visible,
    hasMore,
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    query,
    rawQuery,
    updateQuery,
    searchRef,
    sentinelRef,
  } = useFilteredArticles({
    articles,
    feedId: selectedFeedId,
    readIds,
    bookmarkIds,
    readingListIds,
    historyIds,
    historyOrder,
    selectedArticleId: selectedArticle?.id,
  });

  const currentIndex = useMemo(
    () => (selectedArticle ? filtered.findIndex((a) => a.id === selectedArticle.id) : -1),
    [selectedArticle, filtered],
  );

  // 特定フィードを表示中かつ、サーバー側に未取得ページが残っているか
  const feedHasMorePages = useMemo(() => {
    if (!selectedFeedId || selectedFeedId.startsWith("__")) return false;
    const feed = feeds.find((f) => f.id === selectedFeedId);
    if (!feed?.pageCount) return false;
    const loadedPage = loadedFeedPages.get(selectedFeedId) ?? 1;
    return loadedPage <= feed.pageCount;
  }, [selectedFeedId, feeds, loadedFeedPages]);
  const prevArticle = currentIndex > 0 ? filtered[currentIndex - 1] : null;
  const nextArticle =
    currentIndex >= 0 && currentIndex < filtered.length - 1 ? filtered[currentIndex + 1] : null;

  const selectArticle = useCallback(
    (article: Article) => {
      setSelectedArticle(article);
      markRead(article.id);
      addToHistory(article.id);
      setMobilePane("view");
    },
    [markRead, addToHistory, setMobilePane],
  );

  useKeyboardNav({
    filteredArticles: filtered,
    feeds,
    pinnedFeedIds,
    selectedFeedId,
    selectedArticle,
    readIds,
    readingListIds,
    setSelectedArticle,
    onSelectFeed: (id) => {
      setSelectedFeedId(id);
      setSelectedArticle(null);
    },
    markRead,
    markAllRead,
    toggleBookmark,
    toggleRead,
    toggleReadingList,
    showToast,
    fontSize,
    onChangeFontSize,
    layout,
    onChangeLayout,
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    searchRef,
  });

  // ローディング
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
      </div>
    );
  }

  // ベータ制限
  if (betaRestricted) {
    return (
      <div className="min-h-screen bg-surface-base font-sans antialiased flex flex-col items-center justify-center px-8 text-center">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          className="mb-6 text-text-faint"
        >
          <rect
            width="40"
            height="40"
            rx="10"
            fill="currentColor"
            fillOpacity="0.08"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="1"
          />
          <path
            d="M20 12v9M20 27v2"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-[11px] tracking-[0.3em] uppercase text-text-faint mb-4">Beta Access</p>
        <h1 className="text-[28px] font-light text-text-strong tracking-[-0.01em] mb-3">
          現在クローズドベータ中です
        </h1>
        <p className="text-[14px] text-text-muted leading-relaxed max-w-xs mb-8">
          このサービスは招待制のベータ版です。
          <br />
          アクセス権限をお持ちでない場合はご連絡ください。
        </p>
        <a
          href="/api/auth/login"
          className="text-[12px] tracking-[0.06em] px-5 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
        >
          別のアカウントでログイン
        </a>
      </div>
    );
  }

  // 未ログイン — Landing Page
  if (!user) {
    return (
      <div className="min-h-screen bg-surface-base font-sans antialiased flex flex-col">
        {/* ヘッダー */}
        <header className="px-8 py-4 flex items-center justify-between border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              className="text-text-strong"
            >
              <rect
                width="22"
                height="22"
                rx="5"
                fill="currentColor"
                fillOpacity="0.08"
                stroke="currentColor"
                strokeOpacity="0.2"
                strokeWidth="0.8"
              />
              <circle cx="6" cy="16" r="2.5" fill="currentColor" />
              <path
                d="M6 10.5 A5.5 5.5 0 0 1 11.5 16"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M6 5.5 A10.5 10.5 0 0 1 16.5 16"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[13px] font-medium tracking-[0.04em] text-text-strong">
              RSS Reader
            </span>
          </div>
          <a
            href="/api/auth/login"
            className="text-[12px] tracking-[0.06em] px-4 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
          >
            ログイン
          </a>
        </header>

        {/* ヒーロー */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">
          <p className="text-[11px] tracking-[0.3em] uppercase text-text-faint mb-8 animate-fade-up">
            rss.0g0.xyz
          </p>
          <h1
            className="text-[52px] sm:text-[64px] font-light text-text-strong tracking-[-0.02em] leading-[1.1] mb-5 animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            シンプルな
            <br />
            RSS リーダー
          </h1>
          <p
            className="text-[16px] text-text-muted leading-relaxed mb-10 max-w-sm animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            AI 要約・翻訳、4 種のレイアウト、
            <br />
            ダーク / ライトテーマ対応
          </p>
          <a
            href="/api/auth/login"
            className="animate-fade-up inline-flex items-center gap-2 px-8 py-3 bg-ink hover:bg-ink-hover text-ink-text text-[13px] tracking-[0.06em] rounded-full transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
            style={{ animationDelay: "180ms" }}
          >
            0g0 ID でログイン
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </a>
        </main>

        {/* 機能カード */}
        <section
          className="px-8 pb-16 w-full max-w-2xl mx-auto animate-fade-up"
          style={{ animationDelay: "240ms" }}
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "◐", title: "テーマ", desc: "ダーク / ライト" },
              { icon: "⊞", title: "レイアウト", desc: "4 種類" },
              { icon: "✦", title: "AI 機能", desc: "要約・翻訳" },
            ].map((f) => (
              <div
                key={f.title}
                className="px-4 py-4 rounded-xl border border-border-default bg-surface-elevated text-center"
              >
                <div className="text-[20px] mb-2 text-text-muted">{f.icon}</div>
                <div className="text-[13px] font-medium text-text-strong mb-0.5">{f.title}</div>
                <div className="text-[11px] text-text-faint">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* フッター */}
        <footer className="px-8 py-4 text-center text-[11px] text-text-faint border-t border-border-subtle">
          rss.0g0.xyz — Powered by Cloudflare Workers
        </footer>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen font-sans antialiased bg-surface-base text-text-strong lg:grid"
      style={{ gridTemplateColumns: "200px 360px 1fr", gridTemplateRows: "100%" }}
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
        </div>
      )}

      {/* トースト通知 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-[12px] tracking-[0.04em] px-4 py-2 bg-ink text-ink-text rounded-full shadow-lg animate-fade-up pointer-events-none">
          {toast}
        </div>
      )}

      {/* キーボードショートカット ヘルプ */}
      {showHelp && <KeyboardShortcutsModal onClose={() => setShowHelp(false)} />}
      {newArticleCount > 0 && (
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
      <div
        className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== "sidebar" ? "hidden lg:block" : ""}`}
      >
        <ErrorBoundary label="サイドバー">
          <FeedSidebar
            feeds={feeds}
            articles={articles}
            readIds={readIds}
            bookmarkCount={bookmarkCount}
            readingListCount={readingListCount}
            historyCount={historyCount}
            selectedFeedId={selectedFeedId}
            user={user}
            theme={theme}
            onSelectFeed={(id) => {
              setSelectedFeedId(id);
              setSelectedArticle(null);
              setMobilePane("list");
            }}
            onFeedAdded={onFeedAdded}
            onFeedDeleted={onFeedDeleted}
            onFeedRenamed={updateFeed}
            onFeedsImported={replaceFeeds}
            onMarkAllRead={markAllRead}
            onToggleTheme={toggleTheme}
            onSaveArticleUrl={onSaveArticleUrl}
            onRefresh={refreshFeeds}
            onRetryFeed={retryFeed}
            refreshing={refreshing}
            pinnedFeedIds={pinnedFeedIds}
            onTogglePinFeed={togglePinFeed}
            install={install}
            push={{
              supported: pushSupported,
              subscribed: pushSubscribed,
              loading: pushLoading,
              error: pushError,
              onToggle: togglePush,
            }}
          />
        </ErrorBoundary>
      </div>
      <div
        className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== "list" ? "hidden lg:block" : ""}`}
      >
        <ErrorBoundary label="記事一覧">
          <ArticleList
            feeds={feeds}
            readIds={readIds}
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
            onMarkAllRead={() => markAllRead(selectedFeedId)}
            filtered={filtered}
            visible={visible}
            hasMore={hasMore}
            unreadOnly={unreadOnly}
            toggleUnreadOnly={toggleUnreadOnly}
            bookmarkOnly={bookmarkOnly}
            toggleBookmarkOnly={toggleBookmarkOnly}
            sortOrder={sortOrder}
            toggleSortOrder={toggleSortOrder}
            dateRange={dateRange}
            cycleDateRange={cycleDateRange}
            query={query}
            rawQuery={rawQuery}
            updateQuery={updateQuery}
            searchRef={searchRef}
            sentinelRef={sentinelRef}
            feedHasMorePages={feedHasMorePages}
            onLoadMoreFeedArticles={
              selectedFeedId ? () => loadMoreFeedArticles(selectedFeedId) : undefined
            }
          />
        </ErrorBoundary>
      </div>
      <div
        className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== "view" ? "hidden lg:block" : ""}`}
      >
        <ErrorBoundary label="記事表示">
          <ArticleView
            article={selectedArticle}
            isBookmarked={selectedArticle ? bookmarkIds.has(selectedArticle.id) : false}
            onToggleBookmark={toggleBookmark}
            isInReadingList={selectedArticle ? readingListIds.has(selectedArticle.id) : false}
            onToggleReadingList={toggleReadingList}
            onMobileBack={() => setMobilePane("list")}
            fontSize={fontSize}
            onChangeFontSize={onChangeFontSize}
            showToast={showToast}
            prevArticle={prevArticle}
            nextArticle={nextArticle}
            onSelectPrev={prevArticle ? () => selectArticle(prevArticle) : undefined}
            onSelectNext={nextArticle ? () => selectArticle(nextArticle) : undefined}
            theme={theme}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
