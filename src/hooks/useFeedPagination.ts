"use client";

import { useCallback, useMemo } from "react";
import type { Feed } from "../types";

interface FeedPaginationState {
  /** サーバー側に未取得ページが残っているか (全フィード/単一フィード対応) */
  feedHasMorePages: boolean;
  /** 過去ページをサーバーから読み込み、`notifyArticlesAdded` を呼ぶ */
  handleLoadMoreFeedArticles: () => Promise<void>;
}

interface FeedPaginationOptions {
  selectedFeedId: string | null;
  feeds: Feed[];
  loadedFeedPages: Map<string, number>;
  loadMoreFeedArticles: (feedId: string) => Promise<void>;
  loadMoreAllFeedsArticles: (feeds: Feed[]) => Promise<void>;
  notifyArticlesAdded: () => void;
}

/**
 * フィードページネーションの「未読ページ判定」と「ロード処理」を集約する hook (#650 Step 1j)。
 *
 * - `feedHasMorePages`: 単一フィード時はそのフィードの `pageCount`、全フィード時は
 *   いずれかのフィードに未読み込みページがあれば true
 * - 特殊フィード (`__bookmark` / `__history` 等) では `false` を返す
 * - `handleLoadMoreFeedArticles`: 単一/全体を分岐してから `notifyArticlesAdded` を呼ぶ
 *
 * 元 `App.tsx` の `feedHasMorePages` useMemo と `handleLoadMoreFeedArticles` useCallback を
 * まとめて切り出し。
 */
export function useFeedPagination({
  selectedFeedId,
  feeds,
  loadedFeedPages,
  loadMoreFeedArticles,
  loadMoreAllFeedsArticles,
  notifyArticlesAdded,
}: FeedPaginationOptions): FeedPaginationState {
  const feedHasMorePages = useMemo(() => {
    if (selectedFeedId?.startsWith("__")) return false;
    if (selectedFeedId) {
      const feed = feeds.find((f) => f.id === selectedFeedId);
      if (!feed?.pageCount) return false;
      const loadedPage = loadedFeedPages.get(selectedFeedId) ?? 1;
      return loadedPage <= feed.pageCount;
    }
    // 全フィード表示: いずれかのフィードに未読み込みページがあれば true
    return feeds.some((f) => {
      if (!f.pageCount) return false;
      const loadedPage = loadedFeedPages.get(f.id) ?? 1;
      return loadedPage <= f.pageCount;
    });
  }, [selectedFeedId, feeds, loadedFeedPages]);

  const handleLoadMoreFeedArticles = useCallback(async () => {
    if (selectedFeedId) {
      await loadMoreFeedArticles(selectedFeedId);
    } else {
      await loadMoreAllFeedsArticles(feeds);
    }
    notifyArticlesAdded();
  }, [selectedFeedId, loadMoreFeedArticles, loadMoreAllFeedsArticles, feeds, notifyArticlesAdded]);

  return { feedHasMorePages, handleLoadMoreFeedArticles };
}
