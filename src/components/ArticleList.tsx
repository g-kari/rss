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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import GalleryMasonry from "./GalleryMasonry";
import { useDelayedGalleryItems } from "@/hooks/useDelayedGalleryItems";
import { useEventListener } from "@/hooks/useEventListener";
import { usePopupLock } from "@/hooks/usePopupLock";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import type { Article, Feed, FeedView, Layout, DateRange } from "../types";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { SelectedArticleCtx } from "../contexts/SelectedArticleContext";
import { SHORTCUT_MAP } from "../config/shortcuts";
import FeedFilterModal from "./FeedFilterModal";
import { useOgpCache } from "../hooks/useOgpCache";
import { usePrefetchGalleryContents } from "../hooks/usePrefetchGalleryContents";
import { extractEmbedThumbnailUrl } from "../lib/embed-utils";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { useFullTextSearch } from "../hooks/useFullTextSearch";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { useGalleryAutoRead } from "../hooks/useGalleryAutoRead";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { isArticleRead } from "../lib/article-filter";
import Spinner from "./Spinner";
import LayoutIcon from "./LayoutIcon";
import {
  type ArticleItemProps,
  resolveThumbnail,
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
  GalleryArticleItem,
} from "./ArticleItems";
import { READING_TIME_RANGE_LABELS } from "../lib/article-utils";

interface Props {
  feeds: Feed[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
  bookmarkIds: Set<string>;
  selectedArticleId: string | null;
  selectedFeedId: string | null;
  layout: Layout;
  loading?: boolean;
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
  /**
   * 選択中の FeedView カテゴリ。pictures の場合、ギャラリーレイアウトの表示記事本文を
   * 先行取得して本文内の全画像をカードに展開する（usePrefetchGalleryContents）。
   */
  activeFeedView?: FeedView;
  /** 記事一覧フォーカスモード（サイドバーと記事ビューを畳む） */
  listFocusMode: boolean;
  onToggleListFocusMode: () => void;
}

const LAYOUTS: Layout[] = ["compact", "list", "card", "magazine", "gallery"];

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

/** compact / list レイアウト用のフラットアイテム型 */
type FlatItem =
  | { type: "header"; label: string; key: string }
  | { type: "article"; article: Article; articleIndex: number; key: string };

const LAYOUT_LABELS: Record<Layout, string> = {
  compact: "コンパクト表示",
  list: "リスト表示",
  card: "カード表示",
  magazine: "マガジン表示",
  gallery: "ギャラリー表示",
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "日付",
  today: "今日",
  week: "今週",
  month: "今月",
};

// ── ギャラリーレンダラー（チカチカ対策: render の identity を安定化） ─────
// masonic は render prop の identity 変化で各セルを unmount/remount するため、
// ArticleList の再 render ごとに新規関数を渡すと全カードが再マウントされる（チカチカ発生）。
// module scope で memo 化された Component を保持し、動的な closure は Context 経由で供給する。

interface GalleryContextMenuTarget {
  article: Article;
  thumb: string | null;
  images: string[] | undefined;
  x: number;
  y: number;
}

interface GalleryItemContextValue {
  resolveItemProps: (article: Article, index: number) => ArticleItemProps;
  galleryImagesForItem: (articleId: string) => string[] | undefined;
  /** 既読などで消えゆくアイテムの id 集合 — 該当要素は opacity 遷移で消す */
  deletingIds: Set<string>;
  onGalleryContextMenu: (e: React.MouseEvent, article: Article, index: number) => void;
}

const GalleryItemCtx = createContext<GalleryItemContextValue | null>(null);

// 削除中 wrapper の style — 参照安定化のため module scope に固定
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
  if (!ctx) return null;
  const isDeleting = ctx.deletingIds.has(data.id);
  return (
    <div
      style={isDeleting ? GALLERY_CARD_WRAPPER_STYLE_DELETING : GALLERY_CARD_WRAPPER_STYLE_VISIBLE}
      onContextMenu={(e) => ctx.onGalleryContextMenu(e, data, index)}
    >
      <GalleryArticleItem
        {...ctx.resolveItemProps(data, index)}
        prefetchedImages={ctx.galleryImagesForItem(data.id)}
      />
    </div>
  );
});

const galleryItemKey = (a: Article) => a.id;
const getArticleId = (a: Article) => a.id;

// ── メインコンポーネント ───────────────────────────────────────────────

export default function ArticleList({
  feeds,
  readIds,
  readBeforeTimestamp = null,
  bookmarkIds,
  selectedArticleId,
  selectedFeedId,
  layout,
  loading = false,
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
}: Props) {
  const {
    filtered,
    visible,
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
    rawQuery,
    updateQuery,
    searchRef,
    sentinelRef,
    globalFilter,
    setGlobalFilter,
    authorFilter,
    setAuthorFilter,
    categoryFilter,
    setCategoryFilter,
  } = useArticleFilter();
  const { galleryColumns, autoReadEnabled } = useReaderSettings();
  const [globalFilterModalOpen, setGlobalFilterModalOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);
  const confirmMarkAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title || f.url])), [feeds]);

  // フィードのカテゴリ一覧（重複除去・ソート済み）
  const feedCategories = useMemo(
    () => [...new Set(feeds.map((f) => f.category).filter(Boolean) as string[])].sort(),
    [feeds],
  );

  // 複数フィードを横断表示するとき（すべて・ブックマーク）はフィード名を表示する
  const showFeedName = selectedFeedId === null || selectedFeedId === SPECIAL_FEED_IDS.BOOKMARKS;

  const ogpCache = useOgpCache(visible);

  // ギャラリー画像プリフェッチ — pictures / videos カテゴリ選択中のみ本文を先行取得。
  // pictures: 本文内の全画像を抽出して複数枚ギャラリー表示
  // videos: 本文内の動画埋込みを YouTube サムネ画像として表示（+ 本文内の画像も含む）
  const galleryPrefetchEnabled =
    layout === "gallery" && (activeFeedView === "pictures" || activeFeedView === "videos");
  const prefetchedMedia = usePrefetchGalleryContents({
    articles: visible,
    enabled: galleryPrefetchEnabled,
  });
  // 動画カテゴリでは iframe URL をサムネイル画像 URL に変換して画像リストにマージ。
  // 呼び出し側の GalleryArticleItem には共通の prefetchedImages として渡す。
  const galleryImagesForItem = useCallback(
    (articleId: string): string[] | undefined => {
      const media = prefetchedMedia.get(articleId);
      if (!media) return undefined;
      if (activeFeedView === "videos") {
        const thumbs = media.embeds
          .map((src) => extractEmbedThumbnailUrl(src))
          .filter((u): u is string => u !== null);
        return [...thumbs, ...media.images];
      }
      return media.images;
    },
    [prefetchedMedia, activeFeedView],
  );

  // 既読などで visible から抜けた記事を 300ms 間フェードアウトさせる（masonic の再配置を滑らかに）
  const { displayItems: galleryDisplayItems, deletingIds: galleryDeletingIds } =
    useDelayedGalleryItems(visible, getArticleId, 300);

  // ── ギャラリーコンテキストメニュー ───────────────────────────────
  const [galleryCtxMenu, setGalleryCtxMenu] = useState<GalleryContextMenuTarget | null>(null);
  usePopupLock(!!galleryCtxMenu);
  useEventListener("scroll", () => setGalleryCtxMenu(null), window, true);
  useEventListener("resize", () => setGalleryCtxMenu(null));

  const handleGalleryContextMenu = useCallback(
    (e: React.MouseEvent, article: Article, _index: number) => {
      e.preventDefault();
      e.stopPropagation();
      const images = galleryImagesForItem(article.id);
      const thumb = resolveThumbnail(article, ogpCache) ?? null;
      setGalleryCtxMenu({
        article,
        thumb,
        images,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [galleryImagesForItem, ogpCache],
  );

  const buildSafeTitle = useCallback((title: string | null | undefined) => {
    return (
      (title ?? "image")
        .replace(/[^\w\s぀-鿿゠-ヿ一-鿿-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40) || "image"
    );
  }, []);

  const downloadImage = useCallback((url: string, filename?: string) => {
    const proxyUrl = buildImageProxyUrl(url);
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename || url.split("/").pop()?.split("?")[0] || "image";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const downloadAllImages = useCallback(
    (images: string[], article: Article) => {
      const safeTitle = buildSafeTitle(article.title);
      images.forEach((url, i) => {
        const ext = url.split(".").pop()?.split("?")[0] ?? "";
        const filename = ext ? `${safeTitle}-${i + 1}.${ext}` : `${safeTitle}-${i + 1}`;
        setTimeout(() => downloadImage(url, filename), i * 200);
      });
    },
    [buildSafeTitle, downloadImage],
  );

  // ── 仮想スクロール ──────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // gallery masonry に scroll 監視対象を state として渡すための参照
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    setScrollEl(scrollContainerRef.current);
  }, []);

  const feedView = activeFeedView ?? "articles";
  useGalleryAutoRead({
    scrollElement: layout === "gallery" ? scrollEl : null,
    enabled: autoReadEnabled && feedView !== "articles",
    readIds,
    onMarkRead,
  });

  // compact / list / card / magazine — visible から抜けた記事を 250ms フェードアウト
  const { displayItems: nonGalleryDisplayItems, deletingIds: nonGalleryDeletingIds } =
    useDelayedGalleryItems(visible, getArticleId, 250);

  // compact / list 用フラットアイテムリスト（日付ヘッダーを含む）
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

  // card 用行リスト（2列ずつ）
  const cardRows = useMemo<Article[][]>(() => {
    if (layout !== "card") return [];
    const rows: Article[][] = [];
    for (let i = 0; i < nonGalleryDisplayItems.length; i += 2) {
      rows.push(nonGalleryDisplayItems.slice(i, Math.min(i + 2, nonGalleryDisplayItems.length)));
    }
    return rows;
  }, [nonGalleryDisplayItems, layout]);

  // compact / list 用バーチャライザー
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

  // card 用バーチャライザー
  const cardVirtualizer = useVirtualizer({
    count: cardRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 224,
    getItemKey: (i) => `card-row-${i}`,
    overscan: 3,
  });

  // フィルター切り替え時に「記事がありません」が一瞬ちらつくのを防ぐ。
  // filtered が非空→空に変化した最初のレンダーでは空状態を表示しない。
  const prevFilteredLengthRef = useRef(filtered.length);
  const wasJustCleared = prevFilteredLengthRef.current > 0 && filtered.length === 0;
  prevFilteredLengthRef.current = filtered.length;

  useEventListener(
    "mousedown",
    (e) => {
      if (!categoryDropdownOpen) return;
      if (!categoryDropdownRef.current?.contains(e.target as Node)) setCategoryDropdownOpen(false);
    },
    document,
  );

  // 検索履歴
  const { history, addToHistory, removeFromHistory } = useSearchHistory();
  const [showHistory, setShowHistory] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 保存検索 (Issue #102) — 高度クエリ構文と組み合わせて再利用
  const { savedSearches, save: saveSearch, removeSaved } = useFullTextSearch();

  // フォーカスが検索コンテナ外に移ったら履歴を閉じる
  const handleSearchBlur = useCallback((e: React.FocusEvent) => {
    if (!searchContainerRef.current?.contains(e.relatedTarget as Node)) {
      setShowHistory(false);
    }
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        updateQuery("");
        searchRef.current?.blur();
        setShowHistory(false);
      } else if (e.key === "Enter" && rawQuery.trim().length >= 2) {
        addToHistory(rawQuery.trim());
        setShowHistory(false);
      }
    },
    [rawQuery, updateQuery, addToHistory, searchRef],
  );

  const applyHistoryItem = useCallback(
    (q: string) => {
      updateQuery(q);
      addToHistory(q);
      setShowHistory(false);
      searchRef.current?.focus();
    },
    [updateQuery, addToHistory, searchRef],
  );

  // selectedArticleId または layout が実際に変化したときだけスクロールする。
  // visible / flatItems を deps に含めると readIds 変化のたびに再実行されて
  // スクロール位置が意図せずリセットされるため、ref 経由で最新値を参照する。
  const prevScrollStateRef = useRef<{ id: string | null; layout: string | null }>({
    id: null,
    layout: null,
  });
  const flatItemsRef = useSyncedRef(flatItems);
  const visibleRef = useSyncedRef(visible);
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
    } else {
      document
        .getElementById(`article-${selectedArticleId}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // listVirtualizer / cardVirtualizer は安定参照のため deps から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArticleId, layout]);

  /** 記事ごとの表示用状態を解決する（ハンドラは親の安定参照を直接渡す）
   * isSelected は SelectedArticleCtx 経由で各アイテムが自己参照するため含めない。
   * これにより selectedArticleId が変わっても全アイテムが re-render されず、
   * 前後 2 件（旧選択・新選択）のみが更新される。
   */
  const resolveItemProps = useCallback(
    (article: Article, index: number, isDeleting?: boolean): ArticleItemProps => ({
      article,
      index,
      isRead: isArticleRead(article, readIds, readBeforeTimestamp),
      isBookmarked: bookmarkIds.has(article.id),
      isDeleting,
      hasNote: !!notes?.[article.id],
      feedName: feedMap.get(article.feedHash) ?? "",
      thumb: resolveThumbnail(article, ogpCache),
      showFeedName,
      query,
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
      ogpCache,
      showFeedName,
      query,
      onSelectArticle,
      onToggleRead,
      onToggleBookmark,
    ],
  );

  return (
    <section className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-base">
      {/* ヘッダー */}
      <div className="flex flex-col border-b border-border-default bg-surface-elevated">
        <div className="flex items-center gap-2 px-4 py-3 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            {onMobileBack && (
              <button
                onClick={onMobileBack}
                className="lg:hidden -ml-1 mr-1 p-1.5 text-text-muted hover:text-text-strong transition-colors"
                aria-label="フィード一覧に戻る"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 3L5 8l5 5" />
                </svg>
              </button>
            )}
            <span className="text-[11px] tracking-[0.12em] uppercase text-text-muted">
              記事
              {filtered.length > 0 && (
                <span className="ml-1 text-text-faint">({filtered.length})</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto min-w-0">
            {/* レイアウト切替 */}
            <div className="flex items-center gap-0.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  onClick={() => onChangeLayout(l)}
                  className={`w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
                    layout === l
                      ? "text-text-strong bg-surface-subtle"
                      : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                  }`}
                  title={LAYOUT_LABELS[l]}
                  aria-label={LAYOUT_LABELS[l]}
                  aria-pressed={layout === l}
                >
                  <LayoutIcon layout={l} />
                </button>
              ))}
            </div>
            {/* 記事一覧フォーカスモード切替 */}
            <button
              onClick={onToggleListFocusMode}
              className={`w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
                listFocusMode
                  ? "text-text-strong bg-surface-subtle"
                  : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
              }`}
              title={listFocusMode ? "記事一覧フォーカス終了 (|)" : "記事一覧フォーカス (|)"}
              aria-label={listFocusMode ? "記事一覧フォーカス終了" : "記事一覧フォーカス"}
              aria-pressed={listFocusMode}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {listFocusMode ? (
                  <>
                    <path d="M9 9L3 3m0 0h6m-6 0v6" />
                    <path d="M15 9l6-6m0 0h-6m6 0v6" />
                    <path d="M9 15l-6 6m0 0h6m-6 0v-6" />
                    <path d="M15 15l6 6m0 0h-6m6 0v-6" />
                  </>
                ) : (
                  <>
                    <path d="M3 9V3m0 0h6M3 3l6 6" />
                    <path d="M21 9V3m0 0h-6m6 0l-6 6" />
                    <path d="M3 15v6m0 0h6m-6 0l6-6" />
                    <path d="M21 15v6m0 0h-6m6 0l-6-6" />
                  </>
                )}
              </svg>
            </button>
            <FilterPillButton
              active={unreadOnly}
              onClick={toggleUnreadOnly}
              title={`${SHORTCUT_MAP["u"]} (u)`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6z" />
                <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </FilterPillButton>
            <FilterPillButton
              active={bookmarkOnly}
              onClick={toggleBookmarkOnly}
              title={`${SHORTCUT_MAP["B"]} (B)`}
              variant="bookmark"
            >
              ★
            </FilterPillButton>
            <FilterPillButton
              active={readingListOnly}
              onClick={toggleReadingListOnly}
              title={`${SHORTCUT_MAP["T"]} (T)`}
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
              >
                <circle cx="6" cy="6" r="4.5" />
                <path d="M6 3.5V6l1.5 1.5" />
              </svg>
            </FilterPillButton>
            <FilterPillButton
              active={likeOnly}
              onClick={toggleLikeOnly}
              title={`${SHORTCUT_MAP["I"]} (I)`}
              variant="like"
            >
              ♥
            </FilterPillButton>
            <FilterPillButton
              active={noteOnly}
              onClick={toggleNoteOnly}
              title="メモありフィルター切替"
              variant="note"
            >
              ✎
            </FilterPillButton>
            {!selectedFeedId && (
              <FilterPillButton
                active={digestMode}
                onClick={toggleDigestMode}
                title={`${SHORTCUT_MAP["D"]} (D)`}
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
                >
                  <path d="M1.5 4.5l4.5-3 4.5 3-4.5 3-4.5-3z" />
                  <path d="M1.5 7.5l4.5 3 4.5-3" />
                </svg>
              </FilterPillButton>
            )}
            <FilterPillButton
              active={dateRange !== "all"}
              onClick={cycleDateRange}
              title={`${SHORTCUT_MAP["d"]}: ${DATE_RANGE_LABELS[dateRange]} (d)`}
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
              >
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
                <path d="M1.5 5.5h9M4 1v3M8 1v3" />
              </svg>
            </FilterPillButton>
            <FilterPillButton
              active={readingTimeRange !== "all"}
              onClick={cycleReadingTimeRange}
              title={`読了時間フィルター: ${READING_TIME_RANGE_LABELS[readingTimeRange]}`}
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
              >
                <circle cx="6" cy="7" r="4" />
                <path d="M6 4V2M4.5 1.5h3M6 5.5V7l1.5 1" />
              </svg>
            </FilterPillButton>
            {authorFilter && setAuthorFilter && (
              <button
                onClick={() => setAuthorFilter(null)}
                title={`著者「${authorFilter}」フィルターを解除`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
              >
                <span className="truncate">{authorFilter}</span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M1 1l6 6M7 1L1 7" />
                </svg>
              </button>
            )}
            {/* カテゴリフィルター */}
            {setCategoryFilter && feedCategories.length > 0 && (
              <div className="relative" ref={categoryDropdownRef}>
                {categoryFilter ? (
                  <button
                    onClick={() => setCategoryFilter(null)}
                    title={`カテゴリ「${categoryFilter}」フィルターを解除`}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
                  >
                    <span className="truncate">{categoryFilter}</span>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M1 1l6 6M7 1L1 7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => setCategoryDropdownOpen((v) => !v)}
                    title="カテゴリでフィルター"
                    className={`flex items-center gap-1 px-2 h-6 rounded-full text-[11px] transition-all duration-200 ${
                      categoryDropdownOpen
                        ? "text-text-strong bg-surface-subtle"
                        : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                    }`}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 3h10M3 6h6M5 9h2" />
                    </svg>
                    <span>フォルダ</span>
                  </button>
                )}
                {categoryDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-20 min-w-[120px] bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden">
                    {feedCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setCategoryFilter(cat);
                          setCategoryDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-text-default hover:bg-surface-hover transition-colors truncate"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={toggleSortOrder}
              title={sortOrder === "newest" ? "古い順に切り替え (s)" : "新しい順に切り替え (s)"}
              className="w-6 h-6 flex items-center justify-center rounded-full text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-200"
            >
              {sortOrder === "newest" ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 1v10M2 7l4 4 4-4" />
                </svg>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 11V1M2 5l4-4 4 4" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setGlobalFilterModalOpen(true)}
              title="すべてのフィードにキーワードフィルターを設定"
              className={`flex items-center gap-1 px-2 h-6 rounded-full text-[11px] transition-all duration-200 ${
                globalFilter && (globalFilter.include.length > 0 || globalFilter.exclude.length > 0)
                  ? "text-text-strong bg-surface-subtle"
                  : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
              }`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 2.5h10M3 6h6M5 9.5h2" />
              </svg>
            </button>
            {onMarkAllRead && (
              <button
                onClick={() => {
                  if (confirmMarkAll) {
                    if (confirmMarkAllTimerRef.current)
                      clearTimeout(confirmMarkAllTimerRef.current);
                    confirmMarkAllTimerRef.current = null;
                    setConfirmMarkAll(false);
                    onMarkAllRead();
                  } else {
                    setConfirmMarkAll(true);
                    confirmMarkAllTimerRef.current = setTimeout(() => {
                      setConfirmMarkAll(false);
                      confirmMarkAllTimerRef.current = null;
                    }, 3000);
                  }
                }}
                title={
                  confirmMarkAll ? "もう一度押すと全て既読にします" : `${SHORTCUT_MAP["m"]} (m)`
                }
                className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                  confirmMarkAll
                    ? "px-2 h-6 text-[10px] font-medium text-rose-400 border border-rose-400 hover:bg-rose-400/10"
                    : "w-6 h-6 text-text-faint hover:text-text-muted hover:bg-surface-subtle"
                }`}
              >
                {confirmMarkAll ? (
                  "全既読?"
                ) : (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="6" cy="6" r="4.5" />
                    <path d="M3.5 6l1.8 1.8L8.5 4" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
        <div className="relative px-3 pb-2.5" ref={searchContainerRef} onBlur={handleSearchBlur}>
          <input
            ref={searchRef}
            type="search"
            placeholder="検索... (/ でフォーカス、title:foo OR -bar 等)"
            value={rawQuery}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (history.length > 0 || savedSearches.length > 0) setShowHistory(true);
            }}
            className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg pl-2.5 pr-9 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
          {rawQuery.trim().length >= 2 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const name = window.prompt("保存名を入力してください", rawQuery.trim());
                if (name && name.trim()) saveSearch(name, rawQuery.trim());
              }}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text-strong transition-colors px-1.5 py-0.5"
              title="この検索条件を保存"
            >
              保存
            </button>
          )}
          {showHistory && (savedSearches.length > 0 || history.length > 0) && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {savedSearches.length > 0 && (
                <>
                  <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                    保存済み
                  </div>
                  {savedSearches.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover cursor-pointer group"
                    >
                      <button
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyHistoryItem(s.query);
                        }}
                        title={s.query}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-bookmark flex-shrink-0"
                        >
                          <path d="M3 1.5h6v9l-3-2-3 2z" />
                        </svg>
                        <span className="text-[11px] text-text-default truncate">{s.name}</span>
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          removeSaved(s.id);
                        }}
                        title="保存検索を削除"
                      >
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        >
                          <path d="M1 1l6 6M7 1L1 7" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {history.length > 0 && (
                    <div className="border-t border-border-subtle mt-1 px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                      履歴
                    </div>
                  )}
                </>
              )}
              {history.map((q) => (
                <div
                  key={q}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover cursor-pointer group"
                >
                  <button
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyHistoryItem(q);
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-text-faint flex-shrink-0"
                    >
                      <circle cx="5" cy="5" r="3.5" />
                      <path d="M8 8l2.5 2.5" />
                    </svg>
                    <span className="text-[11px] text-text-default truncate">{q}</span>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      removeFromHistory(q);
                    }}
                    title="履歴から削除"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="M1 1l6 6M7 1L1 7" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SelectedArticleCtx.Provider value={selectedArticleId ?? null}>
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          {loading && filtered.length === 0 && (
            <div className="flex items-center justify-center h-40">
              <p className="text-[12px] text-text-faint">読み込み中...</p>
            </div>
          )}
          {!loading && filtered.length === 0 && !wasJustCleared && (
            <div className="flex items-center justify-center h-40">
              <p className="text-[12px] text-text-faint">記事がありません</p>
            </div>
          )}

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
                        )}
                      />
                    ) : (
                      <ListArticleItem
                        {...resolveItemProps(
                          item.article,
                          item.articleIndex,
                          nonGalleryDeletingIds.has(item.article.id),
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
                          )}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* magazine — 仮想スクロールなし（先頭フィーチャー記事 + コンパクトリスト） */}
          {layout === "magazine" && nonGalleryDisplayItems.length > 0 && (
            <>
              <div className="p-2">
                <MagazineFeaturedArticleItem
                  {...resolveItemProps(
                    nonGalleryDisplayItems[0],
                    0,
                    nonGalleryDeletingIds.has(nonGalleryDisplayItems[0].id),
                  )}
                />
              </div>
              {nonGalleryDisplayItems.slice(1).map((a, i) => (
                <CompactArticleItem
                  key={a.id}
                  {...resolveItemProps(a, i + 1, nonGalleryDeletingIds.has(a.id))}
                />
              ))}
            </>
          )}

          {/* gallery — masonic による仮想スクロール対応 Pinterest 型 masonry */}
          {layout === "gallery" && galleryDisplayItems.length > 0 && (
            <div className="p-2 mx-auto">
              <GalleryItemCtx.Provider
                value={{
                  resolveItemProps,
                  galleryImagesForItem,
                  deletingIds: galleryDeletingIds,
                  onGalleryContextMenu: handleGalleryContextMenu,
                }}
              >
                <GalleryMasonry
                  items={galleryDisplayItems}
                  scrollElement={scrollEl}
                  columnWidth={220}
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
      {globalFilterModalOpen && (
        <FeedFilterModal
          initialFilter={globalFilter}
          onClose={() => setGlobalFilterModalOpen(false)}
          onSave={setGlobalFilter}
        />
      )}
      {galleryCtxMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[49]" onPointerDown={() => setGalleryCtxMenu(null)} />
            <div
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[160px]"
              style={(() => {
                const MIN_W = 160;
                const EST_H = 170;
                const left = Math.min(galleryCtxMenu.x, window.innerWidth - MIN_W - 4);
                const spaceBelow = window.innerHeight - galleryCtxMenu.y;
                if (spaceBelow >= EST_H) {
                  return { top: galleryCtxMenu.y, left: Math.max(4, left) };
                }
                return { bottom: window.innerHeight - galleryCtxMenu.y, left: Math.max(4, left) };
              })()}
              onClick={(e) => e.stopPropagation()}
            >
              {galleryCtxMenu.thumb && (
                <button
                  onClick={() => {
                    const url = galleryCtxMenu.thumb!;
                    const safeTitle = buildSafeTitle(galleryCtxMenu.article.title);
                    const ext = url.split(".").pop()?.split("?")[0] ?? "";
                    const filename = ext ? `${safeTitle}-1.${ext}` : `${safeTitle}-1`;
                    downloadImage(url, filename);
                    setGalleryCtxMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
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
                  >
                    <path d="M6 1v8M3 6l3 3 3-3" />
                    <path d="M1 10h10" />
                  </svg>
                  画像を保存
                </button>
              )}
              {galleryCtxMenu.images && galleryCtxMenu.images.length > 1 && (
                <button
                  onClick={() => {
                    downloadAllImages(galleryCtxMenu.images!, galleryCtxMenu.article);
                    setGalleryCtxMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
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
                  >
                    <path d="M6 1v8M3 6l3 3 3-3" />
                    <path d="M1 10h10" />
                    <rect
                      x="9"
                      y="0"
                      width="3"
                      height="3"
                      rx="1"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                  画像を一括保存 ({galleryCtxMenu.images.length}枚)
                </button>
              )}
              <button
                onClick={() => {
                  onToggleRead(galleryCtxMenu.article.id);
                  setGalleryCtxMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
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
                >
                  <path d="M2 6l3 3 5-5" />
                </svg>
                {readIds.has(galleryCtxMenu.article.id) ? "未読にする" : "既読にする"}
              </button>
              <button
                onClick={() => {
                  onToggleBookmark(galleryCtxMenu.article.id);
                  setGalleryCtxMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill={bookmarkIds.has(galleryCtxMenu.article.id) ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.5 1.5h7v9L6 8l-3.5 2.5z" />
                </svg>
                {bookmarkIds.has(galleryCtxMenu.article.id) ? "ブックマーク解除" : "ブックマーク"}
              </button>
            </div>
          </>,
          document.body,
        )}
    </section>
  );
}

const PILL_BASE_CLASS =
  "flex items-center justify-center text-[11px] tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200";
const PILL_INACTIVE_CLASS =
  "border-border-default text-text-muted hover:border-text-muted hover:text-text-default";
const PILL_ACTIVE_CLASSES = {
  default: "border-ink bg-ink text-ink-text",
  bookmark: "border-bookmark bg-bookmark text-ink-text",
  like: "border-rose-400 bg-rose-400 text-ink-text",
  note: "border-amber-400 bg-amber-400 text-ink-text",
} as const;

function FilterPillButton({
  active,
  onClick,
  title,
  children,
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  variant?: keyof typeof PILL_ACTIVE_CLASSES;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`${PILL_BASE_CLASS} ${active ? PILL_ACTIVE_CLASSES[variant] : PILL_INACTIVE_CLASS}`}
    >
      {children}
    </button>
  );
}

function LoadMoreButton({ onLoad }: { onLoad: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          setLoading(true);
          onLoadRef.current().finally(() => {
            if (!cancelled) {
              loadingRef.current = false;
              setLoading(false);
            }
          });
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="flex justify-center py-4">
      <button
        onClick={async () => {
          if (loadingRef.current) return;
          loadingRef.current = true;
          setLoading(true);
          try {
            await onLoad();
          } finally {
            loadingRef.current = false;
            setLoading(false);
          }
        }}
        disabled={loading}
        className="flex items-center gap-1.5 text-[11px] tracking-[0.06em] px-3 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
      >
        {loading ? (
          <Spinner className="w-3 h-3" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 1v10M2 7l4 4 4-4" />
          </svg>
        )}
        {loading ? "読み込み中..." : "過去の記事を読み込む"}
      </button>
    </div>
  );
}
