"use client";

import { lazy, Suspense, useRef, useState, useMemo, useCallback, memo } from "react";
import type {
  Feed,
  Article,
  UserProfile,
  RecommendedFeed,
  FeedGroup,
  FeedView,
  Collection,
} from "../../types";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import ReadingStatsModal from "../ReadingStatsModal";
import FeedItem, { formatCount } from "../FeedItem";
import FeedAddModal from "../FeedAddModal";
import SaveUrlModal from "../SaveUrlModal";
import RecommendationSection from "../RecommendationSection";
import { useFeedOperations } from "../../hooks/useFeedOperations";
import { SPECIAL_FEED_IDS } from "../../lib/storage";
import { isArticleRead } from "../../lib/article-filter";
import { resolveFeedGroupDrop, resolveFeedViewDrop } from "../../lib/feed-group-drop";
import FeedGroupsSection from "./FeedGroupsSection";
import FeedViewTabs from "./FeedViewTabs";
import SpecialViewButton from "./SpecialViewButton";
import { StatItem } from "./FooterIconButton";
import SidebarHeader from "./SidebarHeader";
import SidebarFooter from "./SidebarFooter";
import CategorySection from "./CategorySection";

const ReleaseNotesModal = lazy(() => import("../ReleaseNotesModal"));

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
  selectedGroupId?: string | null;
  user: UserProfile;
  theme: "light" | "dark";
  refreshing: boolean;
  loadingFeeds?: boolean;
  isOnline: boolean;
  pinnedFeedIds: Set<string>;
  collapsedCategories?: Set<string>;
  onToggleCollapseCategory?: (category: string) => void;
  nsfwMode: boolean;
  onSelectFeed: (id: string | null) => void;
  onSelectGroup?: (id: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
  onMarkAllRead: (feedId: string | null) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
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
  feedGroups?: FeedGroup[];
  onSetGroupFeed?: (feed: Feed, groupId: string | null) => Promise<void>;
  onCreateFeedGroup?: (name: string) => Promise<FeedGroup | { error: string }>;
  onRenameFeedGroup?: (id: string, name: string) => Promise<FeedGroup | { error: string }>;
  onDeleteFeedGroup?: (id: string) => Promise<boolean>;
  onToggleCollapseFeedGroup?: (id: string, collapsed: boolean) => Promise<void>;
  onToggleMuteFeedGroup?: (id: string, muted: boolean) => Promise<void>;
  onReorderFeedGroup?: (id: string, direction: "up" | "down") => Promise<void>;
  onMarkAllReadInGroup?: (feedIds: string[]) => void;
  onMuteFeed?: (feed: Feed, mutedUntil: string | null) => Promise<void>;
  onSetFeedView?: (feed: Feed, view: FeedView | null) => Promise<void>;
  activeFeedView: FeedView;
  onChangeActiveFeedView: (view: FeedView) => void;
  recommendations?: RecommendedFeed[];
  recommendationsLoading?: boolean;
  recommendationsRefreshing?: boolean;
  onDismissRecommendation?: (id: string) => void;
  onRefreshRecommendations?: () => void;
  onExportMarkdown?: (mode: "bookmark" | "reading_list") => void;
  onExportNotes?: () => void;
  noteCount?: number;
  /** 選択中のユーザータグ（そのタグが付いた記事のみ表示） */
  selectedTag?: string | null;
  /** タグ選択コールバック */
  onSelectTag?: (tag: string | null) => void;
  /** articleId → タグ配列マップ — タグ別記事数の集計に使用 */
  articleTagIds?: Record<string, string[]>;
  collections?: Collection[];
  selectedCollectionId?: string | null;
  onSelectCollection?: (id: string | null) => void;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
  onRenameCollection?: (id: string, name: string) => Promise<Collection | { error: string }>;
  onDeleteCollection?: (id: string) => Promise<boolean>;
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

function FeedSidebar({
  feeds,
  articles,
  readIds,
  readBeforeTimestamp = null,
  bookmarkCount,
  readingListCount,
  likeCount,
  historyCount,
  selectedFeedId,
  selectedGroupId = null,
  user,
  theme,
  onSelectFeed,
  onSelectGroup,
  onFeedAdded,
  onFeedDeleted,
  onFeedRenamed,
  onFeedsImported,
  onMarkAllRead,
  onToggleTheme,
  onOpenSettings,
  onOpenHelp,
  onSaveArticleUrl,
  onRefresh,
  onRetryFeed,
  onReinferFeed,
  refreshing,
  loadingFeeds = false,
  isOnline,
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
  feedGroups,
  onSetGroupFeed,
  onCreateFeedGroup,
  onRenameFeedGroup,
  onDeleteFeedGroup,
  onToggleCollapseFeedGroup,
  onToggleMuteFeedGroup,
  onReorderFeedGroup,
  onMarkAllReadInGroup,
  onMuteFeed,
  onSetFeedView,
  activeFeedView,
  onChangeActiveFeedView,
  recommendations,
  recommendationsLoading,
  recommendationsRefreshing,
  onDismissRecommendation,
  onRefreshRecommendations,
  onExportMarkdown,
  onExportNotes,
  noteCount,
  selectedTag = null,
  onSelectTag,
  articleTagIds,
  collections,
  selectedCollectionId = null,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection: _onRenameCollection,
  onDeleteCollection: _onDeleteCollection,
  install,
  push,
}: Props) {
  const { onSaveFilter } = useArticleFilter();
  const [newUrl, setNewUrl] = useState("");
  const [newCookie, setNewCookie] = useState("");
  const [newCssSelector, setNewCssSelector] = useState("");
  const [newUseRsshub, setNewUseRsshub] = useState(true);
  const [cssSelectorOpen, setCssSelectorOpen] = useState(false);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const feedSearchRef = useRef<HTMLInputElement>(null);
  const [saveUrl, setSaveUrl] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draggedFeedId, setDraggedFeedId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);

  const handleDropFeedOnView = useCallback(
    (feedId: string, view: FeedView) => {
      if (!onSetFeedView) return;
      const resolved = resolveFeedViewDrop(feedId, view, feeds);
      if (!resolved) return;
      void onSetFeedView(resolved.feed, resolved.targetView);
    },
    [feeds, onSetFeedView],
  );

  const handleDropFeedOnGroup = useCallback(
    (feedId: string, groupId: string | null) => {
      if (!onSetGroupFeed) return;
      const resolved = resolveFeedGroupDrop(feedId, groupId, feeds);
      if (!resolved) return;
      void onSetGroupFeed(resolved.feed, resolved.targetGroupId);
    },
    [feeds, onSetGroupFeed],
  );

  const draggedFeedInGroup = useMemo(() => {
    if (!draggedFeedId) return false;
    const feed = feeds.find((f) => f.id === draggedFeedId);
    return !!feed?.groupId;
  }, [draggedFeedId, feeds]);

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

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    const result = await addFeed(
      newUrl,
      () => {
        setNewUrl("");
        setNewCookie("");
        setNewCssSelector("");
        setNewUseRsshub(true);
        setCookieOpen(false);
        setCssSelectorOpen(false);
        setInputOpen(false);
      },
      newCookie || undefined,
      newCssSelector || undefined,
      newUseRsshub,
    );
    if (result?.canRetryWithSelector) {
      setCssSelectorOpen(true);
    }
  }

  async function handleSaveArticle(mode: "bookmark" | "reading_list") {
    if (!saveUrl.trim()) return;
    setSaveError(null);
    setSaving(true);
    try {
      await onSaveArticleUrl(saveUrl.trim(), mode);
      setSaveUrl("");
      setSaveOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました");
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
        groups={feedGroups}
        onSetGroup={onSetGroupFeed ? (groupId) => onSetGroupFeed(feed, groupId) : undefined}
        onMute={onMuteFeed ? (mutedUntil) => onMuteFeed(feed, mutedUntil) : undefined}
        onSetView={onSetFeedView ? (view) => onSetFeedView(feed, view) : undefined}
        onDragStartFeed={onSetGroupFeed ? (id) => setDraggedFeedId(id) : undefined}
        onDragEndFeed={
          onSetGroupFeed
            ? () => {
                setDraggedFeedId(null);
                setDragOverGroupId(null);
              }
            : undefined
        }
        isDragging={draggedFeedId === feed.id}
      />
    );
  }

  // タグ別記事数の集計: タグ名 → 件数
  // articleTagIds が undefined の場合は空 Map を返す
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!articleTagIds) return map;
    for (const tags of Object.values(articleTagIds)) {
      for (const t of tags) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [articleTagIds]);
  // タグ一覧（記事数降順、同数時はタグ名昇順）
  const sortedTags = useMemo(() => {
    const arr = [...tagCounts.entries()];
    arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return arr;
  }, [tagCounts]);

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

  const { pinnedFeeds, groupedFeeds, categoryGroups, uncategorizedFeeds } = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    const matchFeed = (f: Feed) => !q || (f.title || f.url).toLowerCase().includes(q);
    // アクティブな view でフィルタ（未設定フィードは articles タブに属する扱い）
    const matchView = (f: Feed) =>
      activeFeedView === "articles" ? !f.view || f.view === "articles" : f.view === activeFeedView;
    const matchNsfw = (f: Feed) => nsfwMode || !f.nsfw;
    const pinned = feeds.filter(
      (f) => pinnedFeedIds.has(f.id) && matchView(f) && matchFeed(f) && matchNsfw(f),
    );
    const unpinned = feeds
      .filter((f) => !pinnedFeedIds.has(f.id) && matchView(f) && matchFeed(f) && matchNsfw(f))
      .sort((a, b) => {
        const aHigh = a.priority === "high" ? 0 : 1;
        const bHigh = b.priority === "high" ? 0 : 1;
        return aHigh - bHigh;
      });

    // ユーザーグループ（groupId）に所属するフィードを先に抜き出す。
    // groupId はあるが該当 group がない（orphan）場合は category/未分類にフォールバックする。
    const validGroupIds = new Set((feedGroups ?? []).map((g) => g.id));
    const byGroup = new Map<string, Feed[]>();
    const notGrouped: Feed[] = [];
    for (const feed of unpinned) {
      if (feed.groupId && validGroupIds.has(feed.groupId)) {
        const arr = byGroup.get(feed.groupId) ?? [];
        arr.push(feed);
        byGroup.set(feed.groupId, arr);
      } else {
        notGrouped.push(feed);
      }
    }
    const grouped = (feedGroups ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ group: g, feeds: byGroup.get(g.id) ?? [] }));

    // 残りをカテゴリ別にグループ化
    const catMap = new Map<string, Feed[]>();
    const uncategorized: Feed[] = [];
    for (const feed of notGrouped) {
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
    return {
      pinnedFeeds: pinned,
      groupedFeeds: grouped,
      categoryGroups: sorted,
      uncategorizedFeeds: uncategorized,
    };
  }, [feeds, pinnedFeedIds, feedSearch, feedGroups, activeFeedView, nsfwMode]);

  return (
    <aside
      role="navigation"
      aria-label="フィード一覧"
      className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated"
    >
      {/* ヘッダー */}
      <SidebarHeader
        nsfwMode={nsfwMode}
        feedSearchOpen={feedSearchOpen}
        inputOpen={inputOpen}
        refreshing={refreshing}
        isOnline={isOnline}
        onActivateNsfw={onActivateNsfw}
        onDeactivateNsfw={onDeactivateNsfw}
        onToggleSearch={() => {
          const next = !feedSearchOpen;
          setFeedSearchOpen(next);
          if (next) {
            setTimeout(() => feedSearchRef.current?.focus(), 0);
          } else {
            setFeedSearch("");
          }
        }}
        onToggleInput={() => setInputOpen((v) => !v)}
        onRefresh={onRefresh}
      />

      {/* フィード追加モーダル (Issue #115) */}
      {inputOpen && (
        <FeedAddModal
          url={newUrl}
          onUrlChange={setNewUrl}
          cookie={newCookie}
          onCookieChange={setNewCookie}
          cssSelector={newCssSelector}
          onCssSelectorChange={setNewCssSelector}
          cookieOpen={cookieOpen}
          onCookieOpenChange={setCookieOpen}
          cssSelectorOpen={cssSelectorOpen}
          onCssSelectorOpenChange={setCssSelectorOpen}
          useRsshub={newUseRsshub}
          onUseRsshubChange={setNewUseRsshub}
          adding={adding}
          error={error ?? null}
          onSubmit={handleAddFeed}
          onClose={() => {
            setInputOpen(false);
            setCookieOpen(false);
            setCssSelectorOpen(false);
            setNewUrl("");
            setNewCookie("");
            setNewCssSelector("");
            setNewUseRsshub(true);
            clearError();
          }}
        />
      )}

      {/* フィードビュータブ */}
      <FeedViewTabs
        activeView={activeFeedView}
        onChangeView={onChangeActiveFeedView}
        onDropFeedOnView={handleDropFeedOnView}
      />

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
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2">
        <div
          onClick={() => onSelectFeed(null)}
          className={`group flex items-center justify-between gap-2 px-4 py-1.5 cursor-pointer transition-all duration-200 ${
            selectedFeedId === null
              ? "text-text-strong bg-surface-subtle"
              : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
          }`}
        >
          <span className="text-[13px] tracking-[0.02em] truncate min-w-0">すべて</span>
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

        {sortedTags.length > 0 && onSelectTag && (
          <div className="mt-1 pt-2 border-t border-border-subtle">
            <div className="px-4 pb-1 flex items-center">
              <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                Tags
              </span>
            </div>
            {sortedTags.map(([tag, count]) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(isSelected ? null : tag)}
                  className={`w-full px-4 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                    isSelected
                      ? "bg-surface-subtle text-text-strong"
                      : "hover:bg-surface-hover text-text-muted hover:text-text-strong"
                  }`}
                  title={tag}
                >
                  <span className="text-[13px] truncate">#{tag}</span>
                  <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
                    {count > 99 ? "99+" : count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {collections && collections.length > 0 && onSelectCollection && (
          <div className="mt-1 pt-2 border-t border-border-subtle">
            <div className="px-4 pb-1 flex items-center">
              <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                Collections
              </span>
              {onCreateCollection && (
                <button
                  onClick={() => onCreateCollection("")}
                  className="ml-auto w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all"
                  title="コレクションを作成"
                >
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 9 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <line x1="4.5" y1="1" x2="4.5" y2="8" strokeLinecap="round" />
                    <line x1="1" y1="4.5" x2="8" y2="4.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {collections.map((c) => {
              const isSelected = selectedCollectionId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCollection(isSelected ? null : c.id)}
                  className={`w-full px-4 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                    isSelected
                      ? "bg-surface-subtle text-text-strong"
                      : "hover:bg-surface-hover text-text-muted hover:text-text-strong"
                  }`}
                  title={c.name}
                >
                  <span className="text-[13px] truncate">{c.name}</span>
                  <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
                    {c.articleIds.length > 99 ? "99+" : c.articleIds.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 統計 */}
        <div className="px-4 py-2 flex items-center gap-4 border-t border-border-subtle mt-1">
          <StatItem value={readTodayCount} label="今日" />
          <StatItem value={totalUnread} label="未読" />
          <StatItem value={feeds.length} label="フィード" />
        </div>

        {/* URL から記事を保存 (Issue #115: モーダル化) */}
        <div className="px-4 py-1">
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
        </div>

        {saveOpen && (
          <SaveUrlModal
            url={saveUrl}
            onUrlChange={setSaveUrl}
            saving={saving}
            error={saveError}
            onSave={(mode) => void handleSaveArticle(mode)}
            onClose={() => {
              setSaveOpen(false);
              setSaveUrl("");
              setSaveError(null);
            }}
          />
        )}

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

        {loadingFeeds && feeds.length === 0 && (
          <div className="px-2 py-1 space-y-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded">
                <div className="w-4 h-4 rounded bg-surface-subtle animate-pulse" />
                <div
                  className="h-3 rounded bg-surface-subtle animate-pulse"
                  style={{ width: `${60 + ((i * 17) % 30)}%` }}
                />
              </div>
            ))}
          </div>
        )}

        {feeds.length > 0 && (
          <div className="mx-4 my-2">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {pinnedFeeds.map((feed, i) => renderFeed(feed, true, i))}

        {pinnedFeeds.length > 0 &&
          (groupedFeeds.length > 0 ||
            categoryGroups.length > 0 ||
            uncategorizedFeeds.length > 0) && (
            <div className="mx-4 my-1.5">
              <div className="border-t border-border-subtle" />
            </div>
          )}

        {/* ユーザーグループ（feed-groups）セクション */}
        {(groupedFeeds.length > 0 || onCreateFeedGroup) && (
          <FeedGroupsSection
            groups={groupedFeeds}
            unreadByFeed={unreadByFeed}
            renderFeed={(feed, startIdx) => renderFeed(feed, false, pinnedFeeds.length + startIdx)}
            selectedGroupId={selectedGroupId}
            onSelect={onSelectGroup}
            onCreate={onCreateFeedGroup}
            onRename={onRenameFeedGroup}
            onDelete={onDeleteFeedGroup}
            onToggleCollapse={onToggleCollapseFeedGroup}
            onToggleMute={onToggleMuteFeedGroup}
            onReorder={onReorderFeedGroup}
            onMarkAllRead={
              onMarkAllReadInGroup
                ? (feedIds) => {
                    if (feedIds.length === 0) return;
                    onMarkAllReadInGroup(feedIds);
                  }
                : undefined
            }
            draggedFeedId={draggedFeedId}
            dragOverGroupId={dragOverGroupId}
            onGroupDragOver={(id) => setDragOverGroupId(id)}
            onGroupDragLeave={(id) => setDragOverGroupId((prev) => (prev === id ? null : prev))}
            onGroupDrop={handleDropFeedOnGroup}
          />
        )}

        {groupedFeeds.length > 0 &&
          (categoryGroups.length > 0 || uncategorizedFeeds.length > 0) && (
            <div className="mx-4 my-1.5">
              <div className="border-t border-border-subtle" />
            </div>
          )}

        {draggedFeedInGroup && onSetGroupFeed && (
          <div
            data-testid="ungrouped-drop-zone"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (!dragOverUngrouped) setDragOverUngrouped(true);
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget;
              if (related instanceof Node && e.currentTarget.contains(related)) return;
              setDragOverUngrouped(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const feedId = e.dataTransfer.getData("application/x-rss-feed-id") || draggedFeedId;
              if (feedId) handleDropFeedOnGroup(feedId, null);
              setDragOverUngrouped(false);
            }}
            className={`mx-4 my-2 px-3 py-2 rounded border border-dashed text-[11px] text-center transition-colors ${
              dragOverUngrouped
                ? "border-text-muted bg-surface-subtle text-text-strong"
                : "border-border-default text-text-muted"
            }`}
          >
            グループから外す
          </div>
        )}

        <CategorySection
          categoryGroups={categoryGroups}
          uncategorizedFeeds={uncategorizedFeeds}
          collapsedCategories={collapsedCategories}
          unreadByFeed={unreadByFeed}
          globalOffset={
            pinnedFeeds.length + groupedFeeds.reduce((sum, g) => sum + g.feeds.length, 0)
          }
          onToggleCollapseCategory={onToggleCollapseCategory}
          renderFeed={renderFeed}
        />
      </nav>

      {/* ユーザー情報 */}
      <SidebarFooter
        user={user}
        theme={theme}
        importing={importing}
        onImport={() => fileInputRef.current?.click()}
        onShowReleaseNotes={() => setShowReleaseNotes(true)}
        onShowStats={() => setShowStats(true)}
        onExportOpml={exportOpml}
        onExportMarkdown={onExportMarkdown}
        onExportNotes={onExportNotes}
        noteCount={noteCount}
        install={install}
        push={push}
        onOpenSettings={onOpenSettings}
        onOpenHelp={onOpenHelp}
        onToggleTheme={onToggleTheme}
        onLogout={logout}
      />
      {/* OPML hidden input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        className="hidden"
        onChange={handleImportFile}
      />
      {importMessage && (
        <div
          className={`px-3 py-1.5 text-[11px] border-t border-border-subtle ${importMessage.isError ? "text-rose-400" : "text-text-muted"}`}
        >
          {importMessage.text}
        </div>
      )}
      {showReleaseNotes && (
        <Suspense fallback={null}>
          <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />
        </Suspense>
      )}
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

export default memo(FeedSidebar);
