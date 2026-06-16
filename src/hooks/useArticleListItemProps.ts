"use client";

import { useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { Article, Feed } from "../types";
import type { ArticleItemProps } from "../components/ArticleItems";
import { resolveThumbnail } from "../lib/article-utils";
import { isArticleRead } from "../lib/article-filter";
import { loadProgress } from "./useReadingProgress";
import { useSyncedRef } from "./useSyncedRef";

/**
 * `useArticleListItemProps` の入力型。
 * `ArticleList` 内で個別レイアウトのアイテムレンダリングに必要なすべての state /
 * コールバックを集約する。
 *
 * `feedMap` は呼び出し側 (ArticleList) で他のハンドラーからも参照されるため、
 * フック内で `feeds` から派生させずに既製の Map を受け取る形にしている。
 */
interface Params {
  feedMap: Map<string, Feed>;
  /**
   * フィルタ済み記事配列 (#1134): 読書進捗の per-item localStorage hit を
   * Map<id, progress> 1 回構築に集約するため hook 側で受け取る。
   */
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  bookmarkIds: Set<string>;
  readingListIds?: Set<string>;
  notes?: Record<string, string>;
  showFeedName: boolean;
  query: string;
  duplicateInfo?: Map<string, string[]>;
  filteredCount: number;
  ogpCache: Record<string, string>;
  onSelectArticle: (a: Article, event?: ReactMouseEvent) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onToggleReadingList?: (id: string) => void;
  onContextMenu: (article: Article, x: number, y: number) => void;
}

/**
 * `ArticleList` 内のレイアウト別レンダラー (Compact / List / Card / Magazine /
 * Gallery) が共通で必要とする `ArticleItemProps` を構築するフック。
 *
 * `feedMap` の useMemo / 各種コールバックの useSyncedRef ラッピング /
 * `resolveThumbnail` 適用などをここに集約することで、`ArticleList` 本体は
 * オーケストレーションに専念できる (#651 Step 2)。
 *
 * **注意**: `bookmarkIds` / `readIds` / `notes` は state 値を **直接参照**
 * している（ref パターンを使うと memo された GalleryCardRenderer (Context
 * 経由) で再描画が発火しないバグになる: #634）。
 */
export function useArticleListItemProps({
  feedMap,
  articles,
  readIds,
  readBeforeTimestamp,
  bookmarkIds,
  readingListIds,
  notes,
  showFeedName,
  query,
  duplicateInfo,
  filteredCount,
  ogpCache,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onToggleReadingList,
  onContextMenu,
}: Params) {
  const ogpCacheRef = useSyncedRef(ogpCache);
  const onSelectArticleRef = useSyncedRef(onSelectArticle);
  const onToggleReadRef = useSyncedRef(onToggleRead);
  const onToggleBookmarkRef = useSyncedRef(onToggleBookmark);
  const onToggleReadingListRef = useSyncedRef(onToggleReadingList);

  const stableOnSelectArticle = useCallback(
    (a: Article, event?: ReactMouseEvent) => onSelectArticleRef.current(a, event),
    [],
  );
  const stableOnToggleRead = useCallback((id: string) => onToggleReadRef.current(id), []);
  const stableOnToggleBookmark = useCallback((id: string) => onToggleBookmarkRef.current(id), []);
  const stableOnToggleReadingList = useCallback(
    (id: string) => onToggleReadingListRef.current?.(id),
    [],
  );

  // #968: readBeforeTimestamp を 1 回だけ ms 化して resolveItemProps (記事ごとに呼ばれる) に渡す。
  const readBeforeMs = useMemo(
    () => (readBeforeTimestamp ? Date.parse(readBeforeTimestamp) : null),
    [readBeforeTimestamp],
  );

  // #1134: 読書進捗を articles 配列単位で Map に集約。per-row resolveItemProps 呼出での
  // localStorage.getItem + JSON.parse を articles 変化時の 1 回構築に縮約。
  // j/k 高速操作で identity churn しても loadProgress は再走査されない。
  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) {
      const p = loadProgress(a.id)?.progress;
      if (p != null) map.set(a.id, p);
    }
    return map;
  }, [articles]);

  const resolveItemProps = useCallback(
    (article: Article, index: number, isDeleting?: boolean, isNew?: boolean): ArticleItemProps => {
      const feed = feedMap.get(article.feedHash);
      // #932 / #1134: 途中まで読んだ記事 (5〜95%) のみ進捗バー表示用に値を渡す。
      // progressMap は articles 単位で構築済 (per-row localStorage hit 回避)。
      const rawProgress = progressMap.get(article.id);
      const readingProgress =
        rawProgress != null && rawProgress > 0.05 && rawProgress < 0.95 ? rawProgress : null;
      return {
        article,
        index,
        isRead: isArticleRead(article, readIds, readBeforeMs),
        readingProgress,
        isBookmarked: bookmarkIds.has(article.id),
        isInReadingList: readingListIds?.has(article.id) ?? false,
        isDeleting,
        isNew,
        hasNote: !!notes?.[article.id],
        feedName: feed ? feed.title || feed.url : "",
        thumb: resolveThumbnail(article, ogpCacheRef.current),
        showFeedName,
        query,
        duplicateFeedNames: duplicateInfo?.get(article.id),
        totalCount: filteredCount,
        onSelectArticle: stableOnSelectArticle,
        onToggleRead: stableOnToggleRead,
        onToggleBookmark: stableOnToggleBookmark,
        onToggleReadingList:
          onToggleReadingListRef.current !== undefined ? stableOnToggleReadingList : undefined,
        onContextMenu,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelect*・onToggle* は useSyncedRef の安定参照経由で最新値を参照するため deps 不要
    [
      readBeforeMs,
      feedMap,
      progressMap,
      ogpCacheRef,
      showFeedName,
      query,
      filteredCount,
      readIds,
      bookmarkIds,
      readingListIds,
      notes,
      duplicateInfo,
      onContextMenu,
    ],
  );

  return { resolveItemProps };
}
