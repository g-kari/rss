"use client";

import {
  useMemo,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
  memo,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import GalleryMasonry from "./GalleryMasonry";
import { useDelayedGalleryItems } from "@/hooks/useDelayedGalleryItems";
import { useEventListener } from "@/hooks/useEventListener";
import { usePopupLock } from "@/hooks/usePopupLock";
import type { Article, Feed, FeedView, Layout } from "../types";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { SelectedArticleCtx } from "../contexts/SelectedArticleContext";
import { useOgpCache } from "../hooks/useOgpCache";
import { usePrefetchGalleryContents } from "../hooks/usePrefetchGalleryContents";
import { extractEmbedThumbnailUrl } from "../lib/embed-utils";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { useGalleryAutoRead } from "../hooks/useGalleryAutoRead";
import { useGallerySwipeNav } from "../hooks/useGallerySwipeNav";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { isArticleRead } from "../lib/article-filter";
import {
  type ArticleItemProps,
  resolveThumbnail,
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
  GalleryArticleItem,
} from "./ArticleItems";
import ArticleListHeader from "./ArticleListHeader";
import GalleryContextMenu, { type GalleryContextMenuTarget } from "./GalleryContextMenu";
import LoadMoreButton from "./LoadMoreButton";
import ArticleListEmptyState from "./ArticleListEmptyState";
import { getGalleryCardWidth } from "../lib/reader-settings";

interface Props {
  feeds: Feed[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
  bookmarkIds: Set<string>;
  selectedArticleId: string | null;
  selectedFeedId: string | null;
  layout: Layout;
  loading?: boolean;
  fetchError?: boolean;
  onRetry?: () => void;
  onChangeLayout: (layout: Layout) => void;
  onSelectArticle: (article: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead?: () => void;
  onMobileBack?: () => void;
  feedHasMorePages?: boolean;
  onLoadMoreFeedArticles?: () => Promise<void>;
  notes?: Record<string, string>;
  activeFeedView?: FeedView;
  listFocusMode: boolean;
  onToggleListFocusMode: () => void;
  onGalleryAutoRead?: (id: string) => void;
  duplicateInfo?: Map<string, string[]>;
}

function getDateGroupLabel(publishedAt: string | null): string {
  if (!publishedAt) return "日付不明";
  const d = new Date(publishedAt);
  if (isNaN(d.getTime())) return "日付不明";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(todayStart.getTime() - 30 * 86400000);
  if (d >= todayStart) return "今日";
  if (d >= yesterdayStart) return "昨日";
  if (d >= weekStart) return "今週";
  if (d >= monthStart) return "今月";
  return "それ以前";
}

type FlatItem =
  | { type: "header"; label: string; key: string }
  | { type: "article"; article: Article; articleIndex: number; key: string };

// ── ギャラリーレンダラー（チカチカ対策: render の identity を安定化） ─────

interface GalleryItemContextValue {
  resolveItemProps: (
    article: Article,
    index: number,
    isDeleting?: boolean,
    isNew?: boolean,
  ) => ArticleItemProps;
  galleryImagesForItem: (articleId: string) => string[] | undefined;
  galleryMinImagePx: number;
  deletingIds: Set<string>;
  newIds: Set<string>;
  galleryFailedIds: Set<string>;
  galleryExpandingIds: Set<string>;
  galleryRetryArticle: (id: string) => void;
  onGalleryContextMenu: (e: React.MouseEvent, article: Article, index: number) => void;
  onGalleryLongPress: (article: Article, index: number, x: number, y: number) => void;
}

const GalleryItemCtx = createContext<GalleryItemContextValue | null>(null);

const GALLERY_CARD_WRAPPER_STYLE_VISIBLE = {
  transition: "opacity 0.25s ease",
  opacity: 1,
};
const GALLERY_CARD_WRAPPER_STYLE_DELETING = {
  transition: "opacity 0.25s ease",
  opacity: 0,
  pointerEvents: "none" as const,
};

const GalleryCardRenderer = memo(function GalleryCardRenderer({
  data,
  index,
}: {
  data: Article;
  index: number;
  width: number;
}) {
  const ctx = useContext(GalleryItemCtx);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!ctx) return;
      const touch = e.touches[0];
      touchPos.current = { x: touch.clientX, y: touch.clientY };
      longPressTimer.current = setTimeout(() => {
        ctx.onGalleryLongPress(data, index, touchPos.current.x, touchPos.current.y);
      }, 500);
    },
    [ctx, data, index],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  if (!ctx) return null;
  const isDeleting = ctx.deletingIds.has(data.id);
  const isNew = ctx.newIds.has(data.id);
  return (
    <div
      style={isDeleting ? GALLERY_CARD_WRAPPER_STYLE_DELETING : GALLERY_CARD_WRAPPER_STYLE_VISIBLE}
      onContextMenu={(e) => ctx.onGalleryContextMenu(e, data, index)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <GalleryArticleItem
        {...ctx.resolveItemProps(data, index, isDeleting, isNew)}
        prefetchedImages={ctx.galleryImagesForItem(data.id)}
        galleryMinImagePx={ctx.galleryMinImagePx}
        isFetchFailed={ctx.galleryFailedIds.has(data.id)}
        isExpanding={ctx.galleryExpandingIds.has(data.id)}
        onRetry={() => ctx.galleryRetryArticle(data.id)}
      />
    </div>
  );
});

const galleryItemKey = (a: Article) => a.id;
const getArticleId = (a: Article) => a.id;

// ── メインコンポーネント ───────────────────────────────────────────────

function ArticleList({
  feeds,
  readIds,
  readBeforeTimestamp = null,
  bookmarkIds,
  selectedArticleId,
  selectedFeedId,
  layout,
  loading = false,
  fetchError = false,
  onRetry,
  onChangeLayout,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onMarkRead,
  onMarkAllRead,
  onMobileBack,
  feedHasMorePages,
  onLoadMoreFeedArticles,
  notes,
  activeFeedView,
  listFocusMode,
  onToggleListFocusMode,
  onGalleryAutoRead,
  duplicateInfo,
}: Props) {
  const {
    filtered,
    visible,
    hasMore,
    query,
    sentinelRef,
    unreadOnly,
    bookmarkOnly,
    readingListOnly,
    likeOnly,
    noteOnly,
  } = useArticleFilter();
  const { galleryColumns, galleryCardSize, galleryMinImagePx, autoReadEnabled } =
    useReaderSettings();

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title || f.url])), [feeds]);
  const showFeedName = selectedFeedId === null || selectedFeedId === SPECIAL_FEED_IDS.BOOKMARKS;

  const ogpCache = useOgpCache(visible);

  const galleryPrefetchEnabled =
    layout === "gallery" && (activeFeedView === "pictures" || activeFeedView === "videos");
  const {
    media: prefetchedMedia,
    failedIds: galleryFailedIds,
    expandingIds: galleryExpandingIds,
    retryArticle: galleryRetryArticle,
  } = usePrefetchGalleryContents({
    articles: visible,
    enabled: galleryPrefetchEnabled,
  });
  const prefetchedMediaRef = useSyncedRef(prefetchedMedia);
  const activeFeedViewRef = useSyncedRef(activeFeedView);
  const galleryImagesForItem = useCallback(
    (articleId: string): string[] | undefined => {
      const media = prefetchedMediaRef.current.get(articleId);
      if (!media) return undefined;
      if (activeFeedViewRef.current === "videos") {
        const thumbs = media.embeds
          .map((src) => extractEmbedThumbnailUrl(src))
          .filter((u): u is string => u !== null);
        return [...thumbs, ...media.images];
      }
      return media.images;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetchMedia・readState は ref 経由で最新値を参照するため deps 不要
    [],
  );

  const {
    displayItems: galleryDisplayItems,
    deletingIds: galleryDeletingIds,
    newIds: galleryNewIds,
  } = useDelayedGalleryItems(visible, getArticleId, 300);

  // ── ギャラリーコンテキストメニュー ───────────────────────────────
  const [galleryCtxMenu, setGalleryCtxMenu] = useState<GalleryContextMenuTarget | null>(null);
  usePopupLock(!!galleryCtxMenu);
  useEventListener("scroll", () => setGalleryCtxMenu(null), window, true);
  useEventListener("resize", () => setGalleryCtxMenu(null));

  const ogpCacheRef = useSyncedRef(ogpCache);
  const handleGalleryContextMenu = useCallback(
    (e: React.MouseEvent, article: Article, _index: number) => {
      e.preventDefault();
      e.stopPropagation();
      const images = galleryImagesForItem(article.id);
      const thumb = resolveThumbnail(article, ogpCacheRef.current) ?? null;
      const isNsfw = !!feeds.find((f) => f.id === article.feedHash)?.nsfw;
      setGalleryCtxMenu({ article, thumb, images, x: e.clientX, y: e.clientY, isNsfw });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ogpCacheRef は useSyncedRef の安定参照のため deps 不要
    [galleryImagesForItem, feeds],
  );

  const handleGalleryLongPress = useCallback(
    (article: Article, _index: number, x: number, y: number) => {
      const images = galleryImagesForItem(article.id);
      const thumb = resolveThumbnail(article, ogpCacheRef.current) ?? null;
      const isNsfw = !!feeds.find((f) => f.id === article.feedHash)?.nsfw;
      setGalleryCtxMenu({ article, thumb, images, x, y, isNsfw });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ogpCacheRef は useSyncedRef の安定参照のため deps 不要
    [galleryImagesForItem, feeds],
  );

  // ── 仮想スクロール ──────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    setScrollEl(scrollContainerRef.current);
  }, []);

  const feedView = activeFeedView ?? "articles";
  const onGalleryAutoReadRef = useSyncedRef(onGalleryAutoRead);
  const handleGalleryAutoRead = useCallback(
    (id: string) => {
      onMarkRead(id);
      onGalleryAutoReadRef.current?.(id);
    },
    [onMarkRead, onGalleryAutoReadRef],
  );
  useGalleryAutoRead({
    scrollElement: layout === "gallery" ? scrollEl : null,
    enabled: autoReadEnabled && feedView !== "articles",
    readIds,
    onMarkRead: handleGalleryAutoRead,
  });
  useGallerySwipeNav(scrollEl, layout === "gallery");

  const {
    displayItems: nonGalleryDisplayItems,
    deletingIds: nonGalleryDeletingIds,
    newIds: nonGalleryNewIds,
  } = useDelayedGalleryItems(visible, getArticleId, 250);

  const flatItems = useMemo<FlatItem[]>(() => {
    if (layout !== "compact" && layout !== "list") return [];
    const items: FlatItem[] = [];
    let lastLabel = "";
    nonGalleryDisplayItems.forEach((a, i) => {
      const label = getDateGroupLabel(a.publishedAt);
      if (label !== lastLabel) {
        items.push({ type: "header", label, key: `header-${label}-${i}` });
        lastLabel = label;
      }
      items.push({ type: "article", article: a, articleIndex: i, key: a.id });
    });
    return items;
  }, [nonGalleryDisplayItems, layout]);

  const cardRows = useMemo<Article[][]>(() => {
    if (layout !== "card") return [];
    const rows: Article[][] = [];
    for (let i = 0; i < nonGalleryDisplayItems.length; i += 2) {
      rows.push(nonGalleryDisplayItems.slice(i, Math.min(i + 2, nonGalleryDisplayItems.length)));
    }
    return rows;
  }, [nonGalleryDisplayItems, layout]);

  const listVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (i) => {
      const item = flatItems[i];
      if (!item || item.type === "header") return 36;
      return layout === "compact" ? 44 : 84;
    },
    getItemKey: (i) => flatItems[i]?.key ?? i,
    overscan: 5,
  });

  const cardVirtualizer = useVirtualizer({
    count: cardRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 160,
    getItemKey: (i) => `card-row-${i}`,
    overscan: 3,
  });

  const magazineVirtualizer = useVirtualizer({
    count: Math.max(0, nonGalleryDisplayItems.length - 1),
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 44,
    getItemKey: (i) => nonGalleryDisplayItems[i + 1]?.id ?? `magazine-${i}`,
    overscan: 5,
  });

  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const prevFeedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const key = prevFeedIdRef.current ?? "all";
    const el = scrollContainerRef.current;
    if (el) scrollPositionsRef.current.set(key, el.scrollTop);
    prevFeedIdRef.current = selectedFeedId;
    const newKey = selectedFeedId ?? "all";
    const saved = scrollPositionsRef.current.get(newKey) ?? 0;
    if (el) el.scrollTop = saved;
  }, [selectedFeedId]);

  const prevFilteredLengthRef = useRef(filtered.length);
  const wasJustCleared = prevFilteredLengthRef.current > 0 && filtered.length === 0;
  prevFilteredLengthRef.current = filtered.length;

  const prevScrollStateRef = useRef<{ id: string | null; layout: string | null }>({
    id: null,
    layout: null,
  });
  const flatItemsRef = useSyncedRef(flatItems);
  const visibleRef = useSyncedRef(visible);
  const nonGalleryDisplayItemsRef = useSyncedRef(nonGalleryDisplayItems);
  useEffect(() => {
    if (!selectedArticleId) return;
    if (
      selectedArticleId === prevScrollStateRef.current.id &&
      layout === prevScrollStateRef.current.layout
    )
      return;
    prevScrollStateRef.current = { id: selectedArticleId, layout };
    if (layout === "compact" || layout === "list") {
      const idx = flatItemsRef.current.findIndex(
        (item) => item.type === "article" && item.key === selectedArticleId,
      );
      if (idx >= 0) listVirtualizer.scrollToIndex(idx, { align: "auto" });
    } else if (layout === "card") {
      const articleIdx = visibleRef.current.findIndex((a) => a.id === selectedArticleId);
      if (articleIdx >= 0)
        cardVirtualizer.scrollToIndex(Math.floor(articleIdx / 2), { align: "auto" });
    } else if (layout === "magazine") {
      const magazineIdx = nonGalleryDisplayItemsRef.current.findIndex(
        (a, i) => i > 0 && a.id === selectedArticleId,
      );
      if (magazineIdx >= 1) magazineVirtualizer.scrollToIndex(magazineIdx - 1, { align: "auto" });
    } else {
      const el = document.getElementById(`article-${selectedArticleId}`);
      const container = scrollContainerRef.current;
      if (el && container) {
        const elRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const isVisible = elRect.bottom > cRect.top && elRect.top < cRect.bottom;
        if (!isVisible) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listVirtualizer・cardVirtualizer・magazineVirtualizer・flatItemsRef・visibleRef・nonGalleryDisplayItemsRef は安定参照。記事選択・レイアウト変更時のみスクロール
  }, [selectedArticleId, layout]);

  const resolveItemProps = useCallback(
    (article: Article, index: number, isDeleting?: boolean, isNew?: boolean): ArticleItemProps => ({
      article,
      index,
      isRead: isArticleRead(article, readIds, readBeforeTimestamp),
      isBookmarked: bookmarkIds.has(article.id),
      isDeleting,
      isNew,
      hasNote: !!notes?.[article.id],
      feedName: feedMap.get(article.feedHash) ?? "",
      thumb: resolveThumbnail(article, ogpCacheRef.current),
      showFeedName,
      query,
      duplicateFeedNames: duplicateInfo?.get(article.id),
      totalCount: filtered.length,
      onSelectArticle,
      onToggleRead,
      onToggleBookmark,
    }),
    [
      readIds,
      readBeforeTimestamp,
      bookmarkIds,
      notes,
      feedMap,
      ogpCacheRef,
      showFeedName,
      query,
      duplicateInfo,
      filtered.length,
      onSelectArticle,
      onToggleRead,
      onToggleBookmark,
    ],
  );

  const galleryCtxValue = useMemo<GalleryItemContextValue>(
    () => ({
      resolveItemProps,
      galleryImagesForItem,
      galleryMinImagePx,
      deletingIds: galleryDeletingIds,
      newIds: galleryNewIds,
      galleryFailedIds,
      galleryExpandingIds,
      galleryRetryArticle,
      onGalleryContextMenu: handleGalleryContextMenu,
      onGalleryLongPress: handleGalleryLongPress,
    }),
    [
      resolveItemProps,
      galleryImagesForItem,
      galleryMinImagePx,
      galleryDeletingIds,
      galleryNewIds,
      galleryFailedIds,
      galleryExpandingIds,
      galleryRetryArticle,
      handleGalleryContextMenu,
      handleGalleryLongPress,
    ],
  );

  return (
    <section
      aria-label="記事一覧"
      className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-base"
    >
      <ArticleListHeader
        layout={layout}
        onChangeLayout={onChangeLayout}
        listFocusMode={listFocusMode}
        onToggleListFocusMode={onToggleListFocusMode}
        onMobileBack={onMobileBack}
        onMarkAllRead={onMarkAllRead}
        filteredCount={filtered.length}
        selectedFeedId={selectedFeedId}
        feeds={feeds}
      />

      <SelectedArticleCtx.Provider value={selectedArticleId ?? null}>
        <div
          ref={scrollContainerRef}
          role="feed"
          aria-label="記事"
          aria-busy={loading}
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <ArticleListEmptyState
            loading={loading}
            fetchError={fetchError}
            filteredCount={filtered.length}
            feedsCount={feeds.length}
            wasJustCleared={wasJustCleared}
            query={query}
            unreadOnly={unreadOnly}
            bookmarkOnly={bookmarkOnly}
            readingListOnly={readingListOnly}
            likeOnly={likeOnly}
            noteOnly={noteOnly}
            onRetry={onRetry}
          />

          {/* compact / list — 仮想スクロール */}
          {(layout === "compact" || layout === "list") && flatItems.length > 0 && (
            <div style={{ height: listVirtualizer.getTotalSize(), position: "relative" }}>
              {listVirtualizer.getVirtualItems().map((vItem) => {
                const item = flatItems[vItem.index];
                if (!item) return null;
                return (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={listVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vItem.start}px)`,
                      transition:
                        nonGalleryDeletingIds.size > 0 || nonGalleryNewIds.size > 0
                          ? "transform 0.2s ease"
                          : undefined,
                    }}
                  >
                    {item.type === "header" ? (
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                          {item.label}
                        </span>
                      </div>
                    ) : layout === "compact" ? (
                      <CompactArticleItem
                        {...resolveItemProps(
                          item.article,
                          item.articleIndex,
                          nonGalleryDeletingIds.has(item.article.id),
                          nonGalleryNewIds.has(item.article.id),
                        )}
                      />
                    ) : (
                      <ListArticleItem
                        {...resolveItemProps(
                          item.article,
                          item.articleIndex,
                          nonGalleryDeletingIds.has(item.article.id),
                          nonGalleryNewIds.has(item.article.id),
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* card — 仮想スクロール（2列ずつ行単位で仮想化） */}
          {layout === "card" && cardRows.length > 0 && (
            <div style={{ height: cardVirtualizer.getTotalSize() + 16, position: "relative" }}>
              {cardVirtualizer.getVirtualItems().map((vItem) => {
                const row = cardRows[vItem.index];
                if (!row) return null;
                return (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={cardVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vItem.start}px)`,
                      transition:
                        nonGalleryDeletingIds.size > 0 || nonGalleryNewIds.size > 0
                          ? "transform 0.2s ease"
                          : undefined,
                      padding: "4px 8px",
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {row.map((a, ri) => (
                        <CardArticleItem
                          key={a.id}
                          {...resolveItemProps(
                            a,
                            vItem.index * 2 + ri,
                            nonGalleryDeletingIds.has(a.id),
                            nonGalleryNewIds.has(a.id),
                          )}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* magazine — 仮想スクロール（先頭フィーチャー記事 + 仮想化コンパクトリスト） */}
          {layout === "magazine" && nonGalleryDisplayItems.length > 0 && (
            <>
              <div className="p-2">
                <MagazineFeaturedArticleItem
                  {...resolveItemProps(
                    nonGalleryDisplayItems[0],
                    0,
                    nonGalleryDeletingIds.has(nonGalleryDisplayItems[0].id),
                    nonGalleryNewIds.has(nonGalleryDisplayItems[0].id),
                  )}
                />
              </div>
              {nonGalleryDisplayItems.length > 1 && (
                <div style={{ height: magazineVirtualizer.getTotalSize(), position: "relative" }}>
                  {magazineVirtualizer.getVirtualItems().map((vItem) => {
                    const a = nonGalleryDisplayItems[vItem.index + 1];
                    if (!a) return null;
                    return (
                      <div
                        key={vItem.key}
                        data-index={vItem.index}
                        ref={magazineVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${vItem.start}px)`,
                          transition:
                            nonGalleryDeletingIds.size > 0 || nonGalleryNewIds.size > 0
                              ? "transform 0.2s ease"
                              : undefined,
                        }}
                      >
                        <CompactArticleItem
                          {...resolveItemProps(
                            a,
                            vItem.index + 1,
                            nonGalleryDeletingIds.has(a.id),
                            nonGalleryNewIds.has(a.id),
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* gallery — masonic による仮想スクロール対応 Pinterest 型 masonry */}
          {layout === "gallery" && galleryDisplayItems.length > 0 && (
            <div className="p-2 mx-auto">
              <GalleryItemCtx.Provider value={galleryCtxValue}>
                <GalleryMasonry
                  items={galleryDisplayItems}
                  scrollElement={scrollEl}
                  columnWidth={getGalleryCardWidth(galleryCardSize)}
                  columnGutter={12}
                  overscanBy={6}
                  columns={
                    galleryColumns === "auto" ? (listFocusMode ? 6 : null) : Number(galleryColumns)
                  }
                  itemKey={galleryItemKey}
                  render={GalleryCardRenderer}
                />
              </GalleryItemCtx.Provider>
            </div>
          )}

          <div ref={sentinelRef} className="h-10" aria-hidden />
          {!hasMore && feedHasMorePages && onLoadMoreFeedArticles && (
            <LoadMoreButton onLoad={onLoadMoreFeedArticles} />
          )}
        </div>
      </SelectedArticleCtx.Provider>
      {galleryCtxMenu && (
        <GalleryContextMenu
          target={galleryCtxMenu}
          readIds={readIds}
          bookmarkIds={bookmarkIds}
          onToggleRead={onToggleRead}
          onToggleBookmark={onToggleBookmark}
          onClose={() => setGalleryCtxMenu(null)}
        />
      )}
    </section>
  );
}

export default memo(ArticleList);
