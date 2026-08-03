"use client";

import { useMemo } from "react";
import type { Article } from "../types";

interface ArticleNavigationState {
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
 *
 * 重複記事対応 (defensive layer): filtered 配列内に **同 id 記事が重複** している場合、
 * 素朴な `filtered[currentIndex + 1]` は同 id 記事に遷移して「次の記事に進めない」バグを
 * 生む。`useArticleData.fetchAndSetArticles` の dedup 追加で上流側で防御済だが、ここでも
 * defensive layer として `currentIndex + 1` から線形検索で **最初の異なる id 記事** を
 * 返す。two-layer defense で完全防止。
 */
export function useArticleNavigation(
  selectedArticle: Article | null,
  filtered: Article[],
): ArticleNavigationState {
  const currentIndex = useMemo(
    () => (selectedArticle ? filtered.findIndex((a) => a.id === selectedArticle.id) : -1),
    [selectedArticle, filtered],
  );
  const nextArticle = useMemo(() => {
    if (currentIndex < 0 || !selectedArticle) return null;
    for (let i = currentIndex + 1; i < filtered.length; i++) {
      if (filtered[i].id !== selectedArticle.id) return filtered[i];
    }
    return null;
  }, [currentIndex, filtered, selectedArticle]);
  const prevArticle = useMemo(() => {
    if (currentIndex < 0 || !selectedArticle) return null;
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (filtered[i].id !== selectedArticle.id) return filtered[i];
    }
    return null;
  }, [currentIndex, filtered, selectedArticle]);
  return { currentIndex, prevArticle, nextArticle };
}
