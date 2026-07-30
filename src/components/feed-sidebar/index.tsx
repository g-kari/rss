"use client";

import { useState, useEffect, useRef, useCallback, memo, type FormEvent } from "react";
import type {
  Feed,
  Article,
  UserProfile,
  RecommendedFeed,
  FeedGroup,
  FeedView,
  Collection,
} from "../../types";
import dynamic from "next/dynamic";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { useFeedSidebarContext } from "../../contexts/FeedSidebarContext";
import { useUnreadStats } from "../../contexts/UnreadStatsContext";
import { useToast } from "../../contexts/ToastContext";
import FeedItem from "../feed-item";
import { formatCount } from "../../lib/article-utils";
import RecommendationSection from "../RecommendationSection";
import { useFeedOperations } from "../../hooks/useFeedOperations";
import { useSidebarFeeds } from "../../hooks/useSidebarFeeds";
import { useFeedDragDrop } from "../../hooks/useFeedDragDrop";
import { SPECIAL_FEED_IDS, STORAGE_KEYS, storageGet } from "../../lib/storage";
import FeedGroupsSection from "./FeedGroupsSection";
import FeedViewTabs from "./FeedViewTabs";
import SpecialViewButton from "./SpecialViewButton";
import { StatItem } from "./FooterIconButton";
import SidebarHeader from "./SidebarHeader";
import SidebarFooter from "./SidebarFooter";
import CategorySection from "./CategorySection";
import TagsSection from "./TagsSection";
import CollectionsSection from "./CollectionsSection";
import FeedSearchBar from "./FeedSearchBar";

const ReadingStatsModal = dynamic(() => import("../ReadingStatsModal"), { ssr: false });
const FeedAddModal = dynamic(() => import("../FeedAddModal"), { ssr: false });
const SaveUrlModal = dynamic(() => import("../SaveUrlModal"), { ssr: false });
const ReleaseNotesModal = dynamic(() => import("../ReleaseNotesModal"), { ssr: false });
const FeedHealthModal = dynamic(() => import("../FeedHealthModal"), { ssr: false });

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
  loadError?: string | null;
  onRetry?: () => void;
  isOnline: boolean;
  pinnedFeedIds: Set<string>;
  collapsedCategories?: Set<string>;
  nsfwMode: boolean;
  activeFeedView: FeedView;
  recommendations?: RecommendedFeed[];
  recommendationsLoading?: boolean;
  recommendationsRefreshing?: boolean;
  recommendationsError?: string | null;
  noteCount?: number;
  selectedTag?: string | null;
  articleTagIds?: Record<string, string[]>;
  collections?: Collection[];
  collectionsLoadError?: string | null;
  onRetryCollections?: () => void;
  selectedCollectionId?: string | null;
  feedGroups?: FeedGroup[];
  totalUnread?: number;
  install?: { canInstall: boolean; onInstall: () => void };
  push?: {
    supported: boolean;
    subscribed: boolean;
    loading: boolean;
    error: string | null;
    onToggle: () => void;
    onSendTest?: () => Promise<string>;
  };
  /**
   * #722: 外部 (App.tsx の空状態 CTA など) からフィード追加モーダルを開くための trigger counter。
   * 値が変化するたびに `setInputOpen(true)` を呼んで FeedAddModal を表示する。
   * `react-patterns.md` の「trigger counter で同じ依存値でも useEffect を強制再実行する」パターン。
   */
  openFeedAddTrigger?: number;
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
  refreshing,
  loadingFeeds = false,
  loadError = null,
  onRetry,
  isOnline,
  pinnedFeedIds,
  collapsedCategories = new Set(),
  nsfwMode,
  activeFeedView,
  recommendations,
  recommendationsLoading,
  recommendationsRefreshing,
  recommendationsError,
  noteCount,
  selectedTag = null,
  articleTagIds,
  collections,
  collectionsLoadError,
  onRetryCollections,
  selectedCollectionId = null,
  feedGroups,
  totalUnread: totalUnreadProp,
  install,
  push,
  openFeedAddTrigger,
}: Props) {
  const {
    onSelectFeed,
    onSelectGroup,
    onSelectTag,
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
    onTogglePinFeed,
    onToggleCollapseCategory,
    onActivateNsfw,
    onDeactivateNsfw,
    onToggleNsfwFeed,
    onTogglePriorityFeed,
    onSetCategoryFeed,
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
    onSetDigestLimit,
    onChangeActiveFeedView,
    onDismissRecommendation,
    onRefreshRecommendations,
    onExportMarkdown,
    onExportJson,
    onExportNotes,
    onExportNotesJson,
    onExportReadwise,
    onExportCollectionMarkdown,
    onExportCollectionJson,
    selectedCollectionName,
    onSelectCollection,
    onCreateCollection,
  } = useFeedSidebarContext();
  const { onSaveFilter } = useArticleFilter();
  const toast = useToast();
  const { readTodayCount: ctxReadTodayCount } = useUnreadStats();
  const [weeklyGoal] = useState<number | undefined>(() => {
    const v = Number(storageGet(STORAGE_KEYS.WEEKLY_GOAL));
    return v || undefined;
  });
  const [newUrl, setNewUrl] = useState("");
  const [newCookie, setNewCookie] = useState("");
  const [newCssSelector, setNewCssSelector] = useState("");
  const [newUseRsshub, setNewUseRsshub] = useState(true);
  const [cssSelectorOpen, setCssSelectorOpen] = useState(false);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  // #722: 外部 trigger counter 変化で FeedAddModal を開く (空状態 CTA からの起動)
  const prevOpenTriggerRef = useRef<number | undefined>(openFeedAddTrigger);
  useEffect(() => {
    if (openFeedAddTrigger === undefined) return;
    if (prevOpenTriggerRef.current !== openFeedAddTrigger) {
      prevOpenTriggerRef.current = openFeedAddTrigger;
      setInputOpen(true);
    }
  }, [openFeedAddTrigger]);
  const [feedSearch, setFeedSearch] = useState("");
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFeedHealth, setShowFeedHealth] = useState(false);
  const [saveUrl, setSaveUrl] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    draggedFeedId,
    setDraggedFeedId,
    dragOverGroupId,
    setDragOverGroupId,
    dragOverUngrouped,
    setDragOverUngrouped,
    handleDropFeedOnView,
    handleDropFeedOnGroup,
    draggedFeedInGroup,
  } = useFeedDragDrop({ feeds, onSetFeedView, onSetGroupFeed });

  // #1076: FeedItem に渡す drag end handler を stable 化 (memo(FeedItem) を無効化しないため)
  const handleFeedDragEnd = useCallback(() => {
    setDraggedFeedId(null);
    setDragOverGroupId(null);
  }, [setDraggedFeedId, setDragOverGroupId]);

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
  } = useFeedOperations({
    onFeedAdded,
    onFeedDeleted,
    onFeedRenamed,
    onFeedsImported,
    onError: toast.error,
  });

  // Issue #410: フォームリセットとモーダルクローズを一括処理する共通関数
  function handleCloseFeedAdd() {
    setInputOpen(false);
    setCookieOpen(false);
    setCssSelectorOpen(false);
    setNewUrl("");
    setNewCookie("");
    setNewCssSelector("");
    setNewUseRsshub(true);
    clearError();
  }

  async function handleAddFeed(e: FormEvent) {
    e.preventDefault();
    const result = await addFeed(
      newUrl,
      () => {
        toast.success("フィードを追加しました");
        handleCloseFeedAdd();
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

  const {
    sortedTags,
    unreadByFeed,
    totalUnread: totalUnreadCalc,
    lastPublishedByFeed,
    readTodayCount,
    pinnedFeeds,
    groupedFeeds,
    categoryGroups,
    uncategorizedFeeds,
  } = useSidebarFeeds({
    feeds,
    articleTagIds,
    pinnedFeedIds,
    feedSearch,
    feedGroups,
    activeFeedView,
    nsfwMode,
  });

  const totalUnread = totalUnreadProp ?? totalUnreadCalc;

  // #1076 同様: memo(CategorySection) / memo(FeedGroupsSection) を無効化しないため
  // renderFeed を useCallback で stable 化する (feedSearch / inputOpen 等の無関係な
  // state 変化での全フィードリスト再 render を防ぐ)。
  const renderFeed = useCallback(
    (feed: Feed, isPinned: boolean, globalIdx: number) => {
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
          onSelect={onSelectFeed}
          onMarkAllRead={onMarkAllRead}
          onDelete={deleteFeed}
          onTogglePin={onTogglePinFeed}
          onRename={renameFeed}
          onRetry={onRetryFeed}
          onReinfer={onReinferFeed}
          onFilterSave={onSaveFilter}
          onToggleNsfw={onToggleNsfwFeed}
          onTogglePriority={onTogglePriorityFeed}
          onSetCategory={onSetCategoryFeed}
          groups={feedGroups}
          onSetGroup={onSetGroupFeed}
          onMute={onMuteFeed}
          onSetView={onSetFeedView}
          onSetDigestLimit={onSetDigestLimit}
          onDragStartFeed={onSetGroupFeed ? setDraggedFeedId : undefined}
          onDragEndFeed={onSetGroupFeed ? handleFeedDragEnd : undefined}
          isDragging={draggedFeedId === feed.id}
        />
      );
    },
    [
      unreadByFeed,
      lastPublishedByFeed,
      selectedFeedId,
      onSelectFeed,
      onMarkAllRead,
      deleteFeed,
      onTogglePinFeed,
      renameFeed,
      onRetryFeed,
      onReinferFeed,
      onSaveFilter,
      onToggleNsfwFeed,
      onTogglePriorityFeed,
      onSetCategoryFeed,
      feedGroups,
      onSetGroupFeed,
      onMuteFeed,
      onSetFeedView,
      onSetDigestLimit,
      setDraggedFeedId,
      handleFeedDragEnd,
      draggedFeedId,
    ],
  );

  // FeedGroupsSection (memo) に渡す signature 変換 wrapper も stable 化する。
  // inline arrow だと renderFeed を useCallback 化しても memo(FeedGroupsSection) が毎 render 失敗する。
  const renderGroupFeed = useCallback(
    (feed: Feed, startIdx: number) => renderFeed(feed, false, pinnedFeeds.length + startIdx),
    [renderFeed, pinnedFeeds.length],
  );

  return (
    <aside
      role="navigation"
      aria-label="フィード一覧"
      className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated"
    >
      {/* ヘッダー */}
      <SidebarHeader
        nsfwMode={nsfwMode}
        inputOpen={inputOpen}
        refreshing={refreshing}
        isOnline={isOnline}
        onActivateNsfw={onActivateNsfw}
        onDeactivateNsfw={onDeactivateNsfw}
        onToggleInput={() => {
          if (inputOpen) {
            // Issue #410: モーダルを閉じる際は必ずフォームをリセットする
            handleCloseFeedAdd();
          } else {
            setInputOpen(true);
          }
        }}
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
          onClose={handleCloseFeedAdd}
        />
      )}

      {/* フィードビュータブ */}
      <FeedViewTabs
        activeView={activeFeedView}
        onChangeView={onChangeActiveFeedView}
        onDropFeedOnView={handleDropFeedOnView}
      />

      {/* フィード検索（インライン常時表示） */}
      {feeds.length > 0 && <FeedSearchBar value={feedSearch} onChange={setFeedSearch} />}

      {/* フィードリスト (FeedViewTabs の tabpanel) */}
      <nav
        id="feed-view-panel"
        role="tabpanel"
        aria-labelledby={`feed-view-tab-${activeFeedView}`}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2"
      >
        {/* #1222: 「すべて」button 内に「全て既読」button を nest すると HTML5 content model
            違反 (interactive content の入れ子) になるため、外枠を div にして 2 button を
            sibling として並置する (canonical: FeedGroupsSection / SpecialViewButton)。 */}
        <div
          className={`group flex items-center justify-between gap-2 px-4 min-h-[44px] w-full transition-all duration-200 ${
            selectedFeedId === null
              ? "text-text-strong bg-surface-subtle"
              : "text-text-muted hover:text-text-strong hover:bg-surface-hover"
          }`}
        >
          <button
            type="button"
            onClick={() => onSelectFeed(null)}
            aria-current={selectedFeedId === null ? "page" : undefined}
            className="flex-1 min-w-0 text-left text-[13px] tracking-[0.02em] truncate cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset"
          >
            すべて
          </button>
          <span className="flex items-center gap-1 flex-shrink-0">
            {totalUnread > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {formatCount(totalUnread)}
              </span>
            )}
            {totalUnread > 0 && (
              <span className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity duration-150">
                <button
                  type="button"
                  onClick={() => onMarkAllRead(null)}
                  className="p-0.5 max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] inline-flex items-center justify-center text-text-faint hover:text-text-default transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded"
                  title="全て既読 (m)"
                  aria-label="すべてのフィードを全て既読にする"
                >
                  <svg
                    aria-hidden="true"
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
          { id: SPECIAL_FEED_IDS.DIGEST, label: "ダイジェスト", count: undefined },
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

        {onSelectTag && (
          <TagsSection
            sortedTags={sortedTags}
            selectedTag={selectedTag ?? null}
            onSelectTag={onSelectTag}
          />
        )}

        {(collections || collectionsLoadError) && onSelectCollection && (
          <CollectionsSection
            collections={collections ?? []}
            selectedCollectionId={selectedCollectionId ?? null}
            onSelectCollection={onSelectCollection}
            onCreateCollection={onCreateCollection}
            loadError={collectionsLoadError}
            onRetryCollections={onRetryCollections}
          />
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
            error={recommendationsError ?? null}
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

        {loadError && feeds.length === 0 && (
          <div className="px-4 py-3 text-center">
            <p role="alert" className="text-[12px] text-error mb-2">
              {loadError}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[12px] text-text-default hover:text-text-strong underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded"
              >
                再試行
              </button>
            )}
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
            renderFeed={renderGroupFeed}
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
        onShowFeedHealth={() => setShowFeedHealth(true)}
        onExportOpml={exportOpml}
        onExportMarkdown={onExportMarkdown}
        onExportJson={onExportJson}
        onExportNotes={onExportNotes}
        onExportNotesJson={onExportNotesJson}
        onExportReadwise={onExportReadwise}
        onExportCollectionMarkdown={onExportCollectionMarkdown}
        onExportCollectionJson={onExportCollectionJson}
        selectedCollectionName={selectedCollectionName}
        noteCount={noteCount}
        install={install}
        push={push}
        onOpenSettings={onOpenSettings}
        onOpenHelp={onOpenHelp}
        onToggleTheme={onToggleTheme}
        onLogout={logout}
        readTodayCount={ctxReadTodayCount}
        weeklyGoal={weeklyGoal}
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
          className={`px-3 py-1.5 text-[11px] border-t border-border-subtle ${importMessage.isError ? "text-error" : "text-text-muted"}`}
        >
          {importMessage.text}
        </div>
      )}
      {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
      {showFeedHealth && <FeedHealthModal feeds={feeds} onClose={() => setShowFeedHealth(false)} />}
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
