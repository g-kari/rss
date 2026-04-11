"use client";

import { useRef, useState, useMemo, type ReactNode } from "react";
import type { Feed, Article, UserProfile, RecommendedFeed, KeywordFilter } from "../types";
import ReleaseNotesModal from "./ReleaseNotesModal";
import ReadingStatsModal from "./ReadingStatsModal";
import FeedItem, { formatCount } from "./FeedItem";
import RecommendationSection from "./RecommendationSection";
import { useFeedOperations } from "../hooks/useFeedOperations";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { isArticleRead } from "../lib/article-filter";

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
  bookmarkCount: number;
  readingListCount: number;
  likeCount: number;
  historyCount: number;
  selectedFeedId: string | null;
  user: UserProfile;
  theme: "light" | "dark";
  refreshing: boolean;
  pinnedFeedIds: Set<string>;
  collapsedCategories?: Set<string>;
  onToggleCollapseCategory?: (category: string) => void;
  nsfwMode: boolean;
  onSelectFeed: (id: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onSaveFilter: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
  onFeedsImported: (feeds: Feed[]) => void;
  onMarkAllRead: (feedId: string | null) => void;
  onToggleTheme: () => void;
  onSaveArticleUrl: (url: string, mode: "bookmark" | "reading_list") => Promise<void>;
  onRefresh: () => void;
  onRetryFeed: (id: string) => Promise<void>;
  onReinferFeed?: (id: string) => Promise<void>;
  onTogglePinFeed: (id: string) => void;
  onActivateNsfw: () => void;
  onDeactivateNsfw: () => void;
  onToggleNsfwFeed: (feed: Feed) => void;
  onTogglePriorityFeed: (feed: Feed) => void;
  onSetCategoryFeed?: (feed: Feed, category: string | null) => Promise<void>;
  onMuteFeed?: (feed: Feed, mutedUntil: string | null) => Promise<void>;
  recommendations?: RecommendedFeed[];
  recommendationsLoading?: boolean;
  recommendationsRefreshing?: boolean;
  onDismissRecommendation?: (id: string) => void;
  onRefreshRecommendations?: () => void;
  onExportMarkdown?: (mode: "bookmark" | "reading_list") => void;
  onExportNotes?: () => void;
  noteCount?: number;
  install?: { canInstall: boolean; onInstall: () => void };
  push?: {
    supported: boolean;
    subscribed: boolean;
    loading: boolean;
    error: string | null;
    onToggle: () => void;
    onSendTest?: () => Promise<string>;
  };
}

function SpecialViewButton({
  id,
  label,
  count,
  selectedFeedId,
  onSelectFeed,
}: {
  id: string;
  label: string;
  count: number;
  selectedFeedId: string | null;
  onSelectFeed: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectFeed(id)}
      aria-current={selectedFeedId === id ? "page" : undefined}
      className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
        selectedFeedId === id
          ? "text-text-strong bg-surface-subtle"
          : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
      }`}
    >
      <span className="text-[13px] tracking-[0.02em]">{label}</span>
      {count > 0 && (
        <span className="text-[11px] text-text-muted tabular-nums">{formatCount(count)}</span>
      )}
    </button>
  );
}

export default function FeedSidebar({
  feeds,
  articles,
  readIds,
  readBeforeTimestamp = null,
  bookmarkCount,
  readingListCount,
  likeCount,
  historyCount,
  selectedFeedId,
  user,
  theme,
  onSelectFeed,
  onFeedAdded,
  onFeedDeleted,
  onFeedRenamed,
  onSaveFilter,
  onFeedsImported,
  onMarkAllRead,
  onToggleTheme,
  onSaveArticleUrl,
  onRefresh,
  onRetryFeed,
  onReinferFeed,
  refreshing,
  pinnedFeedIds,
  collapsedCategories = new Set(),
  onToggleCollapseCategory,
  onTogglePinFeed,
  nsfwMode,
  onActivateNsfw,
  onDeactivateNsfw,
  onToggleNsfwFeed,
  onTogglePriorityFeed,
  onSetCategoryFeed,
  onMuteFeed,
  recommendations,
  recommendationsLoading,
  recommendationsRefreshing,
  onDismissRecommendation,
  onRefreshRecommendations,
  onExportMarkdown,
  onExportNotes,
  noteCount,
  install,
  push,
}: Props) {
  const [newUrl, setNewUrl] = useState("");
  const [newCookie, setNewCookie] = useState("");
  const [cookieOpen, setCookieOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const feedSearchRef = useRef<HTMLInputElement>(null);
  const nsfwLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    addFeed(
      newUrl,
      () => {
        setNewUrl("");
        setNewCookie("");
        setCookieOpen(false);
        setInputOpen(false);
      },
      newCookie || undefined,
    );
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

  function renderFeed(feed: Feed, isPinned: boolean, globalIdx: number) {
    const count = unreadByFeed.get(feed.id) ?? 0;
    return (
      <FeedItem
        key={feed.id}
        feed={feed}
        count={count}
        isSelected={selectedFeedId === feed.id}
        isPinned={isPinned}
        animationIndex={globalIdx}
        lastPublishedAt={lastPublishedByFeed.get(feed.id)}
        onSelect={() => onSelectFeed(feed.id)}
        onMarkAllRead={() => onMarkAllRead(feed.id)}
        onDelete={() => deleteFeed(feed.id)}
        onTogglePin={() => onTogglePinFeed(feed.id)}
        onRename={(title) => renameFeed(feed.id, title)}
        onRetry={() => onRetryFeed(feed.id)}
        onReinfer={onReinferFeed ? () => onReinferFeed(feed.id) : undefined}
        onFilterSave={(filter) => onSaveFilter(feed.id, filter)}
        onToggleNsfw={() => onToggleNsfwFeed(feed)}
        onTogglePriority={() => onTogglePriorityFeed(feed)}
        onSetCategory={
          onSetCategoryFeed ? (category) => onSetCategoryFeed(feed, category) : undefined
        }
        onMute={onMuteFeed ? (mutedUntil) => onMuteFeed(feed, mutedUntil) : undefined}
      />
    );
  }

  const { unreadByFeed, totalUnread, lastPublishedByFeed, readTodayCount } = useMemo(() => {
    const byFeed = new Map<string, number>();
    const lastPublished = new Map<string, string>();
    const today = new Date().toISOString().slice(0, 10);
    let total = 0;
    let todayRead = 0;
    for (const a of articles) {
      if (!isArticleRead(a, readIds, readBeforeTimestamp)) {
        byFeed.set(a.feedHash, (byFeed.get(a.feedHash) ?? 0) + 1);
        total++;
      } else if (a.publishedAt?.slice(0, 10) === today) {
        todayRead++;
      }
      if (a.publishedAt) {
        const prev = lastPublished.get(a.feedHash);
        if (!prev || a.publishedAt > prev) {
          lastPublished.set(a.feedHash, a.publishedAt);
        }
      }
    }
    return {
      unreadByFeed: byFeed,
      totalUnread: total,
      lastPublishedByFeed: lastPublished,
      readTodayCount: todayRead,
    };
  }, [articles, readIds, readBeforeTimestamp]);

  const { pinnedFeeds, categoryGroups, uncategorizedFeeds } = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    const matchFeed = (f: Feed) => !q || (f.title || f.url).toLowerCase().includes(q);
    const pinned = feeds.filter((f) => pinnedFeedIds.has(f.id) && matchFeed(f));
    const unpinned = feeds
      .filter((f) => !pinnedFeedIds.has(f.id) && matchFeed(f))
      .sort((a, b) => {
        const aHigh = a.priority === "high" ? 0 : 1;
        const bHigh = b.priority === "high" ? 0 : 1;
        return aHigh - bHigh;
      });

    // カテゴリ別にグループ化
    const catMap = new Map<string, Feed[]>();
    const uncategorized: Feed[] = [];
    for (const feed of unpinned) {
      if (feed.category) {
        const group = catMap.get(feed.category) ?? [];
        group.push(feed);
        catMap.set(feed.category, group);
      } else {
        uncategorized.push(feed);
      }
    }
    const sorted = [...catMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "ja", { sensitivity: "base" }),
    );
    return { pinnedFeeds: pinned, categoryGroups: sorted, uncategorizedFeeds: uncategorized };
  }, [feeds, pinnedFeedIds, feedSearch]);

  return (
    <aside className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated">
      {/* ヘッダー */}
      <div className="px-4 py-3.5 border-b border-border-default flex items-center justify-between">
        <button
          onClick={onActivateNsfw}
          onPointerDown={() => {
            if (!nsfwMode) return;
            nsfwLongPressTimerRef.current = setTimeout(() => {
              onDeactivateNsfw();
            }, 600);
          }}
          onPointerUp={() => {
            if (nsfwLongPressTimerRef.current) clearTimeout(nsfwLongPressTimerRef.current);
          }}
          onPointerLeave={() => {
            if (nsfwLongPressTimerRef.current) clearTimeout(nsfwLongPressTimerRef.current);
          }}
          onContextMenu={(e) => {
            if (nsfwMode) e.preventDefault();
          }}
          className={`text-[10px] font-medium tracking-[0.25em] uppercase transition-colors duration-200 select-none cursor-default ${nsfwMode ? "text-rose-400" : "text-text-muted"}`}
          title={nsfwMode ? "長押しでNSFWモード解除" : ""}
        >
          RSS
        </button>
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
          aria-label="フィードを検索"
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
          aria-label="フィードを追加"
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
          aria-label={refreshing ? "フィードを更新中" : "フィードを更新"}
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
            {/* Cookie オプション（年齢確認ゲート等の突破用） */}
            <button
              type="button"
              onClick={() => setCookieOpen((v) => !v)}
              className="mt-1.5 text-[10px] text-text-faint hover:text-text-muted transition-colors duration-200"
            >
              {cookieOpen ? "▾ Cookie を隠す" : "▸ Cookie を設定（任意）"}
            </button>
            {cookieOpen && (
              <input
                type="text"
                placeholder="例: age_check_done=1"
                value={newCookie}
                onChange={(e) => setNewCookie(e.target.value)}
                disabled={adding}
                className="mt-1 w-full text-[11px] bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200 font-mono"
              />
            )}
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
                  setCookieOpen(false);
                  setNewCookie("");
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

        {[
          { id: SPECIAL_FEED_IDS.HISTORY, label: "履歴", count: historyCount },
          { id: SPECIAL_FEED_IDS.BOOKMARKS, label: "ブックマーク", count: bookmarkCount },
          { id: SPECIAL_FEED_IDS.READING_LIST, label: "後で読む", count: readingListCount },
          { id: SPECIAL_FEED_IDS.LIKES, label: "いいね", count: likeCount },
        ].map(({ id, label, count }) => (
          <SpecialViewButton
            key={id}
            id={id}
            label={label}
            count={count}
            selectedFeedId={selectedFeedId}
            onSelectFeed={onSelectFeed}
          />
        ))}

        {/* 統計 */}
        <div className="px-4 py-2 flex items-center gap-4 border-t border-border-subtle mt-1">
          <StatItem value={readTodayCount} label="今日" />
          <StatItem value={totalUnread} label="未読" />
          <StatItem value={feeds.length} label="フィード" />
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

        {pinnedFeeds.map((feed, i) => renderFeed(feed, true, i))}

        {pinnedFeeds.length > 0 && (categoryGroups.length > 0 || uncategorizedFeeds.length > 0) && (
          <div className="mx-4 my-1.5">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {(() => {
          let globalOffset = pinnedFeeds.length;
          const elements: ReactNode[] = [];

          for (const [cat, catFeeds] of categoryGroups) {
            const isCollapsed = collapsedCategories.has(cat);
            elements.push(
              <button
                key={`cat-header-${cat}`}
                className="w-full px-4 pt-2.5 pb-0.5 flex items-center gap-1 group"
                onClick={() => onToggleCollapseCategory?.(cat)}
                title={isCollapsed ? "展開" : "折りたたむ"}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  className={`flex-shrink-0 text-text-muted transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`}
                  fill="currentColor"
                >
                  <path d="M5 7L1 3h8L5 7z" />
                </svg>
                <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-text-muted group-hover:text-text-default transition-colors">
                  {cat}
                </span>
                {isCollapsed && (
                  <span className="ml-auto text-[10px] text-text-faint tabular-nums">
                    {catFeeds.length}
                  </span>
                )}
              </button>,
            );
            if (!isCollapsed) {
              catFeeds.forEach((feed, i) => {
                elements.push(renderFeed(feed, false, globalOffset + i));
              });
            }
            globalOffset += catFeeds.length;
          }

          if (categoryGroups.length > 0 && uncategorizedFeeds.length > 0) {
            elements.push(
              <div key="cat-separator" className="mx-4 my-1.5">
                <div className="border-t border-border-subtle" />
              </div>,
            );
          }

          uncategorizedFeeds.forEach((feed, i) => {
            elements.push(renderFeed(feed, false, globalOffset + i));
          });

          return elements;
        })()}
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
        <FooterIconButton
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          title="OPMLインポート"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </FooterIconButton>
        <FooterIconButton onClick={() => setShowReleaseNotes(true)} title="リリースノート">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </FooterIconButton>
        <FooterIconButton onClick={() => setShowStats(true)} title="読書統計">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </FooterIconButton>
        <FooterIconButton onClick={exportOpml} title="OPMLエクスポート">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </FooterIconButton>
        {onExportMarkdown && (
          <button
            onClick={() => onExportMarkdown("bookmark")}
            onContextMenu={(e) => {
              e.preventDefault();
              onExportMarkdown("reading_list");
            }}
            title="ブックマークをMarkdownでエクスポート (右クリック: 後で読む)"
            className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
            aria-label="ブックマークをMarkdownでエクスポート"
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
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </button>
        )}
        {onExportNotes && (noteCount ?? 0) > 0 && (
          <button
            onClick={onExportNotes}
            title={`メモをMarkdownでエクスポート (${noteCount}件)`}
            className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
            aria-label="メモをMarkdownでエクスポート"
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
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
          </button>
        )}
        {install?.canInstall && (
          <FooterIconButton onClick={install.onInstall} title="アプリをインストール">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5"
            />
          </FooterIconButton>
        )}
        {push?.supported && (
          <button
            onClick={push.onToggle}
            onContextMenu={(e) => {
              if (!push.subscribed || !push.onSendTest) return;
              e.preventDefault();
              void push.onSendTest().then((msg) => alert(msg));
            }}
            disabled={push.loading}
            className={`transition-colors duration-200 flex-shrink-0 ${push.error ? "text-rose-400" : push.subscribed ? "text-accent-dot" : "text-text-faint hover:text-text-muted"} disabled:opacity-50`}
            title={
              push.error ??
              (push.subscribed
                ? "プッシュ通知をオフ (右クリックでテスト送信)"
                : "プッシュ通知をオン")
            }
            aria-label={
              push.error ?? (push.subscribed ? "プッシュ通知をオフ" : "プッシュ通知をオン")
            }
            aria-pressed={push.subscribed}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              {push.subscribed ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.143 17.082a24.248 24.248 0 003.844.148m-3.844-.148a23.856 23.856 0 01-5.455-1.31 8.964 8.964 0 002.3-5.542m3.155 6.852a3 3 0 005.667 1.97m1.965-2.277L21 21m-4.225-4.225a23.81 23.81 0 003.536-1.003A8.967 8.967 0 0118 9.75V9A6 6 0 006.53 6.53m10.245 10.245L6.53 6.53M3 3l3.53 3.53"
                />
              )}
            </svg>
          </button>
        )}
        <FooterIconButton
          onClick={onToggleTheme}
          title={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
        >
          {theme === "dark" ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
            />
          )}
        </FooterIconButton>
        <FooterIconButton
          onClick={logout}
          title="ログアウト"
          className="text-text-faint hover:text-text-soft transition-colors duration-200 flex-shrink-0"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </FooterIconButton>
      </div>
      {importMessage && (
        <div
          className={`px-3 py-1.5 text-[11px] border-t border-border-subtle ${importMessage.isError ? "text-rose-400" : "text-text-muted"}`}
        >
          {importMessage.text}
        </div>
      )}
      {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
      {showStats && (
        <ReadingStatsModal
          feeds={feeds}
          articles={articles}
          readIds={readIds}
          readBeforeTimestamp={readBeforeTimestamp}
          onClose={() => setShowStats(false)}
        />
      )}
    </aside>
  );
}

function FooterIconButton({
  onClick,
  title,
  disabled,
  className = "text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0",
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${className}${disabled ? " disabled:opacity-40" : ""}`}
      title={title}
      aria-label={title}
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        {children}
      </svg>
    </button>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-[10px] text-text-faint leading-none">
      <span className="text-text-muted tabular-nums">{value}</span>
      <span className="ml-0.5">{label}</span>
    </span>
  );
}
