"use client";

import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import type { Article, Feed } from "../types";
import type { ArticleItemProps } from "../components/ArticleItems";
import { resolveThumbnail } from "../lib/article-utils";
import { isArticleRead } from "../lib/article-filter";
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

  const resolveItemProps = useCallback(
    (article: Article, index: number, isDeleting?: boolean, isNew?: boolean): ArticleItemProps => {
      const feed = feedMap.get(article.feedHash);
      return {
        article,
        index,
        isRead: isArticleRead(article, readIds, readBeforeTimestamp),
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
        onSelectArticle: (a: Article, event?: ReactMouseEvent) =>
          onSelectArticleRef.current(a, event),
        onToggleRead: (id: string) => onToggleReadRef.current(id),
        onToggleBookmark: (id: string) => onToggleBookmarkRef.current(id),
        onToggleReadingList: onToggleReadingListRef.current
          ? (id: string) => onToggleReadingListRef.current?.(id)
          : undefined,
        onContextMenu,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelect*・onToggle* は useSyncedRef の安定参照経由で最新値を参照するため deps 不要
    [
      readBeforeTimestamp,
      feedMap,
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
