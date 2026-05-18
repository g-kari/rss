"use client";

import {
  useMemo,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
  memo,
  type MouseEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useGalleryAutoScroll } from "../hooks/useGalleryAutoScroll";
import { useArticleListItemProps } from "../hooks/useArticleListItemProps";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { resolveThumbnail } from "./ArticleItems";
import ArticleListHeader from "./ArticleListHeader";
import GalleryContextMenu, { type GalleryContextMenuTarget } from "./GalleryContextMenu";
import ArticleContextMenu, { type ArticleContextMenuTarget } from "./ArticleContextMenu";
import ImageLightbox from "./ImageLightbox";
import LoadMoreButton from "./LoadMoreButton";
import ArticleListEmptyState from "./ArticleListEmptyState";
import { explodeArticlesIntoGalleryEntries, type GalleryEntry } from "../lib/gallery-explode";
import {
  CompactListBody,
  CardBody,
  MagazineBody,
  GalleryBody,
  type GalleryItemContextValue,
  type FlatItem,
} from "./article-list-body";

interface Props {
  feeds: Feed[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
  bookmarkIds: Set<string>;
  /** 後で読むに登録された記事 ID（#633、card/magazine のホバーボタンで使用） */
  readingListIds?: Set<string>;
  selectedArticleId: string | null;
  selectedFeedId: string | null;
  layout: Layout;
  loading?: boolean;
  fetchError?: boolean;
  onRetry?: () => void;
  /** フィード未登録時の空状態に「フィードを追加」CTA を出すためのコールバック */
  onAddFeed?: () => void;
  onChangeLayout: (layout: Layout) => void;
  onSelectArticle: (article: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  /** 後で読むのトグル（#633、card/magazine のホバーボタンで使用） */
  onToggleReadingList?: (id: string) => void;
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
  /** #684: 値が変化するたびに「選択中記事へ強制スクロール」を再実行するトリガーカウンタ */
  anchorTrigger?: number;
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
  onAddFeed,
  onChangeLayout,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onToggleReadingList,
  readingListIds,
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
  anchorTrigger,
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
  const {
    galleryColumns,
    galleryColumnsFocus,
    galleryCardSize,
    galleryMinImagePx,
    autoReadEnabled,
    galleryAutoScrollSpeed,
    onChangeGalleryAutoScrollSpeed,
  } = useReaderSettings();

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
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

  // Phase 1: 画像/動画 view のギャラリー layout のとき、1 記事 N 画像を N カードに分解する。
  // explode flag は galleryPrefetchEnabled と同じ条件 (prefetch 完了画像を使うため一致が必要)。
  // hiddenEntryKeys: min-px フィルタで hidden になった entry を items 配列から除外して
  // masonic に layout 再計算させる (display:none のままだと空白セルが残る問題への対処)。
  const [hiddenEntryKeys, setHiddenEntryKeys] = useState<Set<string>>(new Set());
  const handleHideForcedImage = useCallback((entryKey: string) => {
    setHiddenEntryKeys((prev) => {
      if (prev.has(entryKey)) return prev;
      const next = new Set(prev);
      next.add(entryKey);
      return next;
    });
  }, []);
  // galleryMinImagePx / view 切替 / フォーカスモード切替時は累積していた hidden を全リセット
  // (再判定)。listFocusMode は列数変化で min-px filter を通る画像が増減するため必要 (#771)。
  useEffect(() => {
    setHiddenEntryKeys(new Set());
  }, [galleryMinImagePx, galleryPrefetchEnabled, listFocusMode]);
  const galleryEntries = useMemo<GalleryEntry[] | null>(() => {
    if (!galleryPrefetchEnabled) return null;
    const raw = explodeArticlesIntoGalleryEntries(galleryDisplayItems, {
      explode: true,
      prefetchedImagesByArticleId: galleryImagesForItem,
    });
    if (hiddenEntryKeys.size === 0) return raw;
    return raw.filter((e) => !hiddenEntryKeys.has(e.key));
  }, [galleryPrefetchEnabled, galleryDisplayItems, galleryImagesForItem, hiddenEntryKeys]);

  // ── 画像ライトボックス (Phase 1) ─────────────────────────────────
  const [lightboxState, setLightboxState] = useState<{
    article: Article;
    imageIndex: number;
    images: string[];
  } | null>(null);
  usePopupLock(!!lightboxState);
  const handleSelectImage = useCallback(
    (imageSrc: string, article: Article) => {
      const images = galleryImagesForItem(article.id);
      if (!images || images.length === 0) return;
      const imageIndex = images.indexOf(imageSrc);
      setLightboxState({
        article,
        imageIndex: imageIndex >= 0 ? imageIndex : 0,
        images,
      });
    },
    [galleryImagesForItem],
  );
  const handleLightboxPrev = useCallback(() => {
    setLightboxState((s) => {
      if (!s || s.imageIndex <= 0) return s;
      return { ...s, imageIndex: s.imageIndex - 1 };
    });
  }, []);
  const handleLightboxNext = useCallback(() => {
    setLightboxState((s) => {
      if (!s || s.imageIndex >= s.images.length - 1) return s;
      return { ...s, imageIndex: s.imageIndex + 1 };
    });
  }, []);
  const handleLightboxClose = useCallback(() => setLightboxState(null), []);

  // ── ギャラリーコンテキストメニュー ───────────────────────────────
  const [galleryCtxMenu, setGalleryCtxMenu] = useState<GalleryContextMenuTarget | null>(null);
  usePopupLock(!!galleryCtxMenu);
  useEventListener("scroll", () => setGalleryCtxMenu(null), window, true);
  useEventListener("resize", () => setGalleryCtxMenu(null));

  // ── 記事コンテキストメニュー (#633 A3、compact / list / card / magazine 用) ──
  const [articleCtxMenu, setArticleCtxMenu] = useState<ArticleContextMenuTarget | null>(null);
  usePopupLock(!!articleCtxMenu);
  useEventListener("scroll", () => setArticleCtxMenu(null), window, true);
  useEventListener("resize", () => setArticleCtxMenu(null));
  const handleArticleContextMenu = useCallback((article: Article, x: number, y: number) => {
    setArticleCtxMenu({ article, x, y });
  }, []);

  const ogpCacheRef = useSyncedRef(ogpCache);
  const handleGalleryContextMenu = useCallback(
    (e: MouseEvent, article: Article, _index: number) => {
      e.preventDefault();
      e.stopPropagation();
      const images = galleryImagesForItem(article.id);
      const thumb = resolveThumbnail(article, ogpCacheRef.current) ?? null;
      const isNsfw = !!feedMap.get(article.feedHash)?.nsfw;
      setGalleryCtxMenu({ article, thumb, images, x: e.clientX, y: e.clientY, isNsfw });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ogpCacheRef は useSyncedRef の安定参照のため deps 不要
    [galleryImagesForItem, feedMap],
  );

  const handleGalleryLongPress = useCallback(
    (article: Article, _index: number, x: number, y: number) => {
      const images = galleryImagesForItem(article.id);
      const thumb = resolveThumbnail(article, ogpCacheRef.current) ?? null;
      const isNsfw = !!feedMap.get(article.feedHash)?.nsfw;
      setGalleryCtxMenu({ article, thumb, images, x, y, isNsfw });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ogpCacheRef は useSyncedRef の安定参照のため deps 不要
    [galleryImagesForItem, feedMap],
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
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMarkRead],
  );
  useGalleryAutoRead({
    scrollElement: layout === "gallery" ? scrollEl : null,
    enabled: autoReadEnabled && feedView !== "articles",
    readIds,
    onMarkRead: handleGalleryAutoRead,
  });
  useGallerySwipeNav(scrollEl, layout === "gallery");
  // #690: ギャラリー自動スクロール (連続 / スライドショー ハイブリッド)
  useGalleryAutoScroll({
    scrollEl,
    speed: galleryAutoScrollSpeed,
    enabled: layout === "gallery",
    onUserInterrupt: () => onChangeGalleryAutoScrollSpeed("off"),
  });

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

  const prevScrollStateRef = useRef<{
    id: string | null;
    layout: string | null;
    anchor: number | undefined;
  }>({
    id: null,
    layout: null,
    anchor: undefined,
  });
  const flatItemsRef = useSyncedRef(flatItems);
  const visibleRef = useSyncedRef(visible);
  const nonGalleryDisplayItemsRef = useSyncedRef(nonGalleryDisplayItems);
  useEffect(() => {
    if (!selectedArticleId) return;
    // #684: anchorTrigger が変化したときは prev 一致でも強制再実行 (manual anchor)
    const sameAsPrev =
      selectedArticleId === prevScrollStateRef.current.id &&
      layout === prevScrollStateRef.current.layout;
    const isManualAnchor = anchorTrigger !== prevScrollStateRef.current.anchor;
    if (sameAsPrev && !isManualAnchor) return;
    prevScrollStateRef.current = { id: selectedArticleId, layout, anchor: anchorTrigger };
    // 手動アンカー時は中央寄せ・通常の選択時は近接寄せ
    const align = isManualAnchor ? "center" : "auto";
    if (layout === "compact" || layout === "list") {
      const idx = flatItemsRef.current.findIndex(
        (item) => item.type === "article" && item.key === selectedArticleId,
      );
      if (idx >= 0) listVirtualizer.scrollToIndex(idx, { align });
    } else if (layout === "card") {
      const articleIdx = visibleRef.current.findIndex((a) => a.id === selectedArticleId);
      if (articleIdx >= 0) cardVirtualizer.scrollToIndex(Math.floor(articleIdx / 2), { align });
    } else if (layout === "magazine") {
      const magazineIdx = nonGalleryDisplayItemsRef.current.findIndex(
        (a, i) => i > 0 && a.id === selectedArticleId,
      );
      if (magazineIdx >= 1) magazineVirtualizer.scrollToIndex(magazineIdx - 1, { align });
    } else {
      const el = document.getElementById(`article-${selectedArticleId}`);
      const container = scrollContainerRef.current;
      if (el && container) {
        const elRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const isVisible = elRect.bottom > cRect.top && elRect.top < cRect.bottom;
        // 通常時: 見えていればスキップ / 手動アンカー時は常にセンタリング
        if (isManualAnchor) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } else if (!isVisible) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listVirtualizer・cardVirtualizer・magazineVirtualizer・flatItemsRef・visibleRef・nonGalleryDisplayItemsRef は安定参照。記事選択・レイアウト変更・手動アンカー時のみスクロール
  }, [selectedArticleId, layout, anchorTrigger]);

  const { resolveItemProps } = useArticleListItemProps({
    feedMap,
    readIds,
    readBeforeTimestamp,
    bookmarkIds,
    readingListIds,
    notes,
    showFeedName,
    query,
    duplicateInfo,
    filteredCount: filtered.length,
    ogpCache,
    onSelectArticle,
    onToggleRead,
    onToggleBookmark,
    onToggleReadingList,
    onContextMenu: handleArticleContextMenu,
  });

  // #771: galleryEntries は hiddenEntryKeys 変化で毎回新 reference になるため、
  // 直接 deps にすると 1 カード hide で galleryCtxValue 全再生成 → 全カード re-render の
  // perf 問題が発生する。「entries モードか否か」だけを stable boolean で参照する。
  const hasEntries = galleryEntries !== null;
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
      // Phase 1: explode=true のときだけ画像ライトボックスを開くハンドラを expose する。
      // explode=false (= 通常 view) では undefined のままで、カードクリックは従来通り
      // 記事詳細を開く。
      onSelectImage: hasEntries ? handleSelectImage : undefined,
      // explode=true のときだけ「hidden になった entry を親で除外」する通知を有効化。
      onHideForcedImage: hasEntries ? handleHideForcedImage : undefined,
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
      hasEntries,
      handleSelectImage,
      handleHideForcedImage,
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
          className="flex-1 min-h-0 overflow-y-auto [overflow-anchor:none]"
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
            onAddFeed={onAddFeed}
          />

          {/* compact / list — 仮想スクロール (#651 Step 3: サブコンポーネント化) */}
          {(layout === "compact" || layout === "list") && (
            <CompactListBody
              items={flatItems}
              layout={layout}
              deletingIds={nonGalleryDeletingIds}
              newIds={nonGalleryNewIds}
              virtualizer={listVirtualizer}
              resolveItemProps={resolveItemProps}
            />
          )}

          {/* card — 2 列グリッド行単位の仮想化 */}
          {layout === "card" && (
            <CardBody
              rows={cardRows}
              deletingIds={nonGalleryDeletingIds}
              newIds={nonGalleryNewIds}
              virtualizer={cardVirtualizer}
              resolveItemProps={resolveItemProps}
            />
          )}

          {/* magazine — 先頭フィーチャー + 仮想化コンパクトリスト */}
          {layout === "magazine" && (
            <MagazineBody
              items={nonGalleryDisplayItems}
              deletingIds={nonGalleryDeletingIds}
              newIds={nonGalleryNewIds}
              virtualizer={magazineVirtualizer}
              resolveItemProps={resolveItemProps}
            />
          )}

          {/* gallery — masonic 型 masonry */}
          {layout === "gallery" && (
            <GalleryBody
              items={galleryEntries ?? galleryDisplayItems}
              scrollElement={scrollEl}
              galleryCardSize={galleryCardSize}
              galleryColumns={galleryColumns}
              galleryColumnsFocus={galleryColumnsFocus}
              listFocusMode={listFocusMode}
              contextValue={galleryCtxValue}
            />
          )}

          {/* IntersectionObserver の sentinel — スクロール時に client side で page+=1 する */}
          <div ref={sentinelRef} className="h-32" aria-hidden />
          {/* LoadMoreButton はクライアント側 visible が現 filtered を満たし終えてから
              (hasMore=false) かつサーバー側に過去ページが残っている場合のみ表示する。
              ユーザー仕様: 「最初 500 件のうち pageSize 件ずつ表示 → 500 全部表示後に次 500 取得」 */}
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
          onMarkRead={onMarkRead}
          onSelectArticle={onSelectArticle}
          onClose={() => setGalleryCtxMenu(null)}
        />
      )}
      {lightboxState && (
        <ImageLightbox
          imageSrc={lightboxState.images[lightboxState.imageIndex]!}
          article={lightboxState.article}
          onPrev={lightboxState.imageIndex > 0 ? handleLightboxPrev : null}
          onNext={
            lightboxState.imageIndex < lightboxState.images.length - 1 ? handleLightboxNext : null
          }
          onClose={handleLightboxClose}
          onSelectArticle={onSelectArticle}
        />
      )}
      {articleCtxMenu && onToggleReadingList && readingListIds && (
        <ArticleContextMenu
          target={articleCtxMenu}
          readIds={readIds}
          bookmarkIds={bookmarkIds}
          readingListIds={readingListIds}
          onToggleRead={onToggleRead}
          onToggleBookmark={onToggleBookmark}
          onToggleReadingList={onToggleReadingList}
          onClose={() => setArticleCtxMenu(null)}
        />
      )}
    </section>
  );
}

export default memo(ArticleList);
