"use client";

import { useMemo } from "react";
import type { Article } from "../types";

export interface ArticleNavigationState {
  /** 現在記事の filtered 配列内 index (-1 = 未選択 / 不在) */
  currentIndex: number;
  /** 前後記事 (端は null) */
  prevArticle: Article | null;
  nextArticle: Article | null;
}

/**
 * フィルタ後の記事配列内での「現在記事の index と前後記事」を返す hook (#650 Step 1k)。
 *
 * 元 `App.tsx` の `currentIndex` useMemo + `prevArticle` / `nextArticle` 派生を集約。
 * `j/k` キーナビなど前後遷移系の UI から参照される。
 */
export function useArticleNavigation(
  selectedArticle: Article | null,
  filtered: Article[],
): ArticleNavigationState {
  const currentIndex = useMemo(
    () => (selectedArticle ? filtered.findIndex((a) => a.id === selectedArticle.id) : -1),
    [selectedArticle, filtered],
  );
  const prevArticle = currentIndex > 0 ? filtered[currentIndex - 1] : null;
  const nextArticle =
    currentIndex >= 0 && currentIndex < filtered.length - 1 ? filtered[currentIndex + 1] : null;
  return { currentIndex, prevArticle, nextArticle };
}
