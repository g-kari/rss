"use client";

import { useRef, useState, useMemo } from "react";
import type { Feed, Article, UserProfile, RecommendedFeed, KeywordFilter } from "../types";
import ReleaseNotesModal from "./ReleaseNotesModal";
import FeedItem, { formatCount } from "./FeedItem";
import RecommendationSection from "./RecommendationSection";
import { useFeedOperations } from "../hooks/useFeedOperations";

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  bookmarkCount: number;
  readingListCount: number;
  historyCount: number;
  selectedFeedId: string | null;
  user: UserProfile;
  theme: "light" | "dark";
  refreshing: boolean;
  pinnedFeedIds: Set<string>;
  onSelectFeed: (id: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedFilterSaved: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
  onMarkAllRead: (feedId: string | null) => void;
  onToggleTheme: () => void;
  onSaveArticleUrl: (url: string, mode: "bookmark" | "reading_list") => Promise<void>;
  onRefresh: () => void;
  onRetryFeed: (id: string) => Promise<void>;
  onTogglePinFeed: (id: string) => void;
  recommendations?: RecommendedFeed[];
  recommendationsLoading?: boolean;
  recommendationsRefreshing?: boolean;
  onDismissRecommendation?: (id: string) => void;
  onRefreshRecommendations?: () => void;
  install?: { canInstall: boolean; onInstall: () => void };
  push?: {
    supported: boolean;
    subscribed: boolean;
    loading: boolean;
    error: string | null;
    onToggle: () => void;
  };
}

export default function FeedSidebar({
  feeds,
  articles,
  readIds,
  bookmarkCount,
  readingListCount,
  historyCount,
  selectedFeedId,
  user,
  theme,
  onSelectFeed,
  onFeedAdded,
  onFeedDeleted,
  onFeedRenamed,
  onFeedFilterSaved,
  onFeedsImported,
  onMarkAllRead,
  onToggleTheme,
  onSaveArticleUrl,
  onRefresh,
  onRetryFeed,
  refreshing,
  pinnedFeedIds,
  onTogglePinFeed,
  recommendations,
  recommendationsLoading,
  recommendationsRefreshing,
  onDismissRecommendation,
  onRefreshRecommendations,
  install,
  push,
}: Props) {
  const [newUrl, setNewUrl] = useState("");
  const [inputOpen, setInputOpen] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const feedSearchRef = useRef<HTMLInputElement>(null);
  const [saveUrl, setSaveUrl] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    adding,
    error,
    importing,
    importMessage,
    fileInputRef,
    addFeed,
    deleteFeed,
    renameFeed,
    handleImportFile,
    clearError,
  } = useFeedOperations({ onFeedAdded, onFeedDeleted, onFeedRenamed, onFeedsImported });

  async function saveFilter(feedId: string, filter: KeywordFilter | null): Promise<void> {
    const res = await fetch(`/api/feeds/${feedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter }),
    });
    if (!res.ok) throw new Error("フィルターの保存に失敗しました");
    const updated = (await res.json()) as Feed;
    onFeedFilterSaved(updated);
  }

  function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    addFeed(newUrl, () => {
      setNewUrl("");
      setInputOpen(false);
    });
  }

  async function handleSaveArticle(mode: "bookmark" | "reading_list") {
    if (!saveUrl.trim()) return;
    setSaving(true);
    try {
      await onSaveArticleUrl(saveUrl.trim(), mode);
      setSaveUrl("");
      setSaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  function exportOpml() {
    window.location.href = "/api/feeds/export";
  }

  const { unreadByFeed, totalUnread } = useMemo(() => {
    const byFeed = new Map<string, number>();
    let total = 0;
    for (const a of articles) {
      if (!readIds.has(a.id)) {
        byFeed.set(a.feedHash, (byFeed.get(a.feedHash) ?? 0) + 1);
        total++;
      }
    }
    return { unreadByFeed: byFeed, totalUnread: total };
  }, [articles, readIds]);

  const { pinnedFeeds, unpinnedFeeds } = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    const matchFeed = (f: Feed) => !q || (f.title || f.url).toLowerCase().includes(q);
    const pinned = feeds.filter((f) => pinnedFeedIds.has(f.id) && matchFeed(f));
    const unpinned = feeds.filter((f) => !pinnedFeedIds.has(f.id) && matchFeed(f));
    return { pinnedFeeds: pinned, unpinnedFeeds: unpinned };
  }, [feeds, pinnedFeedIds, feedSearch]);

  return (
    <aside className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated">
      {/* ヘッダー */}
      <div className="px-4 py-3.5 border-b border-border-default flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          RSS
        </span>
        <button
          onClick={() => {
            const next = !feedSearchOpen;
            setFeedSearchOpen(next);
            if (next) {
              setTimeout(() => feedSearchRef.current?.focus(), 0);
            } else {
              setFeedSearch("");
            }
          }}
          className={`w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${
            feedSearchOpen
              ? "text-text-default bg-surface-subtle"
              : "text-text-faint hover:text-text-default hover:bg-surface-subtle"
          }`}
          title="フィードを検索"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="4.5" cy="4.5" r="3" />
            <line x1="7" y1="7" x2="10" y2="10" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={() => setInputOpen((v) => !v)}
          className={`w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${
            inputOpen
              ? "text-text-default bg-surface-subtle"
              : "text-text-faint hover:text-text-default hover:bg-surface-subtle"
          }`}
          title="フィードを追加"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <line x1="5.5" y1="1" x2="5.5" y2="10" />
            <line x1="1" y1="5.5" x2="10" y2="5.5" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-5 h-5 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all duration-200 disabled:opacity-40"
          title="フィードを更新"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={refreshing ? "animate-spin" : ""}
          >
            <path strokeLinecap="round" d="M9.5 2A4.5 4.5 0 1 0 10 6.5" />
            <polyline strokeLinecap="round" strokeLinejoin="round" points="7.5,0.5 9.5,2 8,4" />
          </svg>
        </button>
      </div>

      {/* 追加フォーム */}
      {inputOpen && (
        <div className="px-3 py-2.5 border-b border-border-subtle bg-surface-base animate-fade-up">
          <form onSubmit={handleAddFeed}>
            <input
              type="url"
              placeholder="https://..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              disabled={adding}
              autoFocus
              className="w-full text-[12px] bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
            />
            {error && <p className="text-[11px] text-rose-400 mt-1.5">{error}</p>}
            <div className="flex gap-1.5 mt-1.5">
              <button
                type="submit"
                disabled={adding}
                className="flex-1 text-[11px] tracking-[0.06em] py-1.5 bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40"
              >
                {adding ? "追加中..." : "追加"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputOpen(false);
                  clearError();
                }}
                className="text-[11px] px-3 py-1.5 text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200"
              >
                ✕
              </button>
            </div>
          </form>
        </div>
      )}

      {/* フィード検索 */}
      {feedSearchOpen && (
        <div className="px-3 py-2 border-b border-border-subtle animate-fade-up">
          <input
            ref={feedSearchRef}
            type="text"
            placeholder="フィードを検索..."
            value={feedSearch}
            onChange={(e) => setFeedSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setFeedSearch("");
                setFeedSearchOpen(false);
              }
            }}
            className="w-full text-[12px] bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
        </div>
      )}

      {/* フィードリスト */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-2">
        <div
          onClick={() => onSelectFeed(null)}
          className={`group flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 ${
            selectedFeedId === null
              ? "text-text-strong bg-surface-subtle"
              : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">すべて</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {totalUnread > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {formatCount(totalUnread)}
              </span>
            )}
            {totalUnread > 0 && (
              <span className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAllRead(null);
                  }}
                  className="p-0.5 text-text-faint hover:text-text-default transition-colors duration-150"
                  title="全て既読 (m)"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1.5 5l2.5 2.5L8.5 2.5" />
                  </svg>
                </button>
              </span>
            )}
          </span>
        </div>

        <button
          onClick={() => onSelectFeed("__history__")}
          className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
            selectedFeedId === "__history__"
              ? "text-text-strong bg-surface-subtle"
              : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">履歴</span>
          {historyCount > 0 && (
            <span className="text-[11px] text-text-muted tabular-nums">
              {formatCount(historyCount)}
            </span>
          )}
        </button>
        <div className="group relative">
          <button
            onClick={() => onSelectFeed("__bookmarks__")}
            className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
              selectedFeedId === "__bookmarks__"
                ? "text-text-strong bg-surface-subtle"
                : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
            }`}
          >
            <span className="text-[13px] tracking-[0.02em]">ブックマーク</span>
            {bookmarkCount > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {formatCount(bookmarkCount)}
              </span>
            )}
          </button>
        </div>
        <div className="group relative">
          <button
            onClick={() => onSelectFeed("__reading_list__")}
            className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
              selectedFeedId === "__reading_list__"
                ? "text-text-strong bg-surface-subtle"
                : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
            }`}
          >
            <span className="text-[13px] tracking-[0.02em]">後で読む</span>
            {readingListCount > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {formatCount(readingListCount)}
              </span>
            )}
          </button>
        </div>

        {/* URL から記事を保存 */}
        <div className="px-4 py-1">
          {!saveOpen ? (
            <button
              onClick={() => setSaveOpen(true)}
              className="flex items-center gap-1.5 text-[11px] text-text-faint hover:text-text-muted transition-colors duration-200"
              title="URL から記事を保存"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <line x1="5" y1="1" x2="5" y2="9" />
                <line x1="1" y1="5" x2="9" y2="5" />
              </svg>
              <span>URL を保存</span>
            </button>
          ) : (
            <div className="animate-fade-up">
              <input
                type="url"
                placeholder="https://..."
                value={saveUrl}
                onChange={(e) => setSaveUrl(e.target.value)}
                disabled={saving}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSaveOpen(false);
                    setSaveUrl("");
                  }
                }}
                className="w-full text-[12px] bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
              />
              <div className="flex gap-1 mt-1.5">
                <button
                  onClick={() => void handleSaveArticle("bookmark")}
                  disabled={saving || !saveUrl.trim()}
                  className="flex-1 text-[10px] tracking-[0.04em] py-1.5 bg-ink hover:bg-ink-hover text-ink-text rounded-md transition-all duration-200 disabled:opacity-40"
                >
                  BK
                </button>
                <button
                  onClick={() => void handleSaveArticle("reading_list")}
                  disabled={saving || !saveUrl.trim()}
                  className="flex-1 text-[10px] tracking-[0.04em] py-1.5 bg-ink hover:bg-ink-hover text-ink-text rounded-md transition-all duration-200 disabled:opacity-40"
                >
                  後で
                </button>
                <button
                  onClick={() => {
                    setSaveOpen(false);
                    setSaveUrl("");
                  }}
                  className="text-[10px] px-2 py-1.5 text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-md transition-all duration-200"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        {recommendations && onDismissRecommendation && onRefreshRecommendations && (
          <RecommendationSection
            recommendations={recommendations}
            loading={recommendationsLoading ?? false}
            refreshing={recommendationsRefreshing ?? false}
            onDismiss={onDismissRecommendation}
            onRefresh={onRefreshRecommendations}
            onAddFeed={(url) =>
              new Promise<void>((resolve) => {
                addFeed(url, () => resolve());
                // addFeed はエラー時に内部で error state を更新するのみ
                // 短いタイムアウトで resolve して UI をブロックしない
                setTimeout(resolve, 5000);
              })
            }
          />
        )}

        {feeds.length > 0 && (
          <div className="mx-4 my-2">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {pinnedFeeds.map((feed, i) => {
          const count = unreadByFeed.get(feed.id) ?? 0;
          const isSelected = selectedFeedId === feed.id;
          return (
            <FeedItem
              key={feed.id}
              feed={feed}
              count={count}
              isSelected={isSelected}
              isPinned={true}
              animationIndex={i}
              onSelect={() => onSelectFeed(feed.id)}
              onMarkAllRead={() => onMarkAllRead(feed.id)}
              onDelete={() => deleteFeed(feed.id)}
              onTogglePin={() => onTogglePinFeed(feed.id)}
              onRename={(title) => renameFeed(feed.id, title)}
              onRetry={() => onRetryFeed(feed.id)}
              onFilterSave={(filter) => saveFilter(feed.id, filter)}
            />
          );
        })}

        {pinnedFeeds.length > 0 && unpinnedFeeds.length > 0 && (
          <div className="mx-4 my-1.5">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {unpinnedFeeds.map((feed, i) => {
          const count = unreadByFeed.get(feed.id) ?? 0;
          const isSelected = selectedFeedId === feed.id;
          return (
            <FeedItem
              key={feed.id}
              feed={feed}
              count={count}
              isSelected={isSelected}
              isPinned={false}
              animationIndex={pinnedFeeds.length + i}
              onSelect={() => onSelectFeed(feed.id)}
              onMarkAllRead={() => onMarkAllRead(feed.id)}
              onDelete={() => deleteFeed(feed.id)}
              onTogglePin={() => onTogglePinFeed(feed.id)}
              onRename={(title) => renameFeed(feed.id, title)}
              onRetry={() => onRetryFeed(feed.id)}
              onFilterSave={(filter) => saveFilter(feed.id, filter)}
            />
          );
        })}
      </nav>

      {/* ユーザー情報 */}
      <div className="px-3 py-2.5 border-t border-border-subtle flex items-center gap-2">
        {user.picture ? (
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(user.picture)}`}
            alt=""
            className="w-5 h-5 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-surface-subtle flex-shrink-0" />
        )}
        <span className="text-[11px] text-text-muted truncate flex-1">{user.name}</span>
        {/* OPMLインポート */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml"
          className="hidden"
          onChange={handleImportFile}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0 disabled:opacity-40"
          title="OPMLインポート"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </button>
        {/* リリースノート */}
        <button
          onClick={() => setShowReleaseNotes(true)}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
          title="リリースノート"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </button>
        {/* OPMLエクスポート */}
        <button
          onClick={exportOpml}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
          title="OPMLエクスポート"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </button>
        {install?.canInstall && (
          <button
            onClick={install.onInstall}
            className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
            title="アプリをインストール"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5"
              />
            </svg>
          </button>
        )}
        {push?.supported && (
          <button
            onClick={push.onToggle}
            disabled={push.loading}
            className={`transition-colors duration-200 flex-shrink-0 ${push.error ? "text-rose-400" : push.subscribed ? "text-accent-dot" : "text-text-faint hover:text-text-muted"} disabled:opacity-50`}
            title={push.error ?? (push.subscribed ? "プッシュ通知をオフ" : "プッシュ通知をオン")}
          >
            {push.subscribed ? (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.143 17.082a24.248 24.248 0 003.844.148m-3.844-.148a23.856 23.856 0 01-5.455-1.31 8.964 8.964 0 002.3-5.542m3.155 6.852a3 3 0 005.667 1.97m1.965-2.277L21 21m-4.225-4.225a23.81 23.81 0 003.536-1.003A8.967 8.967 0 0118 9.75V9A6 6 0 006.53 6.53m10.245 10.245L6.53 6.53M3 3l3.53 3.53"
                />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={onToggleTheme}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
          title={theme === "dark" ? "ライトモード" : "ダークモード"}
        >
          {theme === "dark" ? (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
              />
            </svg>
          )}
        </button>
        <button
          onClick={logout}
          className="text-text-faint hover:text-text-soft transition-colors duration-200 flex-shrink-0"
          title="ログアウト"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
      {importMessage && (
        <div
          className={`px-3 py-1.5 text-[11px] border-t border-border-subtle ${importMessage.isError ? "text-rose-400" : "text-text-muted"}`}
        >
          {importMessage.text}
        </div>
      )}
      {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
    </aside>
  );
}
