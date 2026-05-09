"use client";

import { useMemo } from "react";
import type { Collection } from "../types";

/**
 * 選択中コレクションに含まれる記事 ID の Set を導出する hook (#650 Step 1t)。
 *
 * `useFilteredArticles` の `collectionArticleIds` パラメータに渡す Set を構築する。
 * - 選択コレクションなし → `undefined` を返す (フィルタ無効を意味する)
 * - 選択コレクションあり → そのコレクションの `articleIds` から Set を作る
 *
 * useMemo で `selectedCollectionId` / `collections` のどちらかが変化したときだけ
 * 再構築する (記事 ID 数が大量だと Set 構築コストが無視できないため)。
 */
export function useCollectionArticleIds(
  selectedCollectionId: string | null,
  collections: Collection[],
): Set<string> | undefined {
  return useMemo(
    () =>
      selectedCollectionId
        ? new Set(collections.find((c) => c.id === selectedCollectionId)?.articleIds ?? [])
        : undefined,
    [selectedCollectionId, collections],
  );
}
