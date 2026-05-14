"use client";

import { useCallback, useEffect, useState } from "react";
import type { Article } from "../types";
import { useSyncedRef } from "./useSyncedRef";

interface UseArticleSelectionOptions {
  setSelectedArticle: (a: Article | null) => void;
  markRead: (id: string) => void;
  addToHistory: (id: string) => void;
  setMobilePane: (pane: "sidebar" | "list" | "view") => void;
  isDesktop: boolean;
  /** listFocusMode 中はフォーカスモード切替の代わりに overlay を開く */
  listFocusMode: boolean;
}

export interface ArticleSelectionState {
  /** 記事選択 (副作用: 既読化・履歴追加・モバイル pane 切替 or overlay 開) */
  selectArticle: (article: Article) => void;
  /** ArticleDetailOverlay (listFocusMode 専用の右スライド overlay) の開閉状態 */
  articleDetailOverlayOpen: boolean;
  /** overlay を明示的に閉じる */
  closeArticleDetailOverlay: () => void;
}

/**
 * 記事選択ハンドラと ArticleDetailOverlay の開閉状態を集約する hook (#650 Step 1)。
 *
 * 元 `App.tsx` の selectArticle / closeArticleDetailOverlay と関連 state /
 * effect を切り出して、App.tsx を薄いオーケストレーターに近づける。
 *
 * `listFocusModeRef` を内部で `useSyncedRef` で保持することで、`selectArticle`
 * の useCallback deps に含めずに最新値を参照可能 (deps 安定化のため)。
 */
export function useArticleSelection({
  setSelectedArticle,
  markRead,
  addToHistory,
  setMobilePane,
  isDesktop,
  listFocusMode,
}: UseArticleSelectionOptions): ArticleSelectionState {
  const listFocusModeRef = useSyncedRef(listFocusMode);
  const [articleDetailOverlayOpen, setArticleDetailOverlayOpen] = useState(false);

  const selectArticle = useCallback(
    (article: Article) => {
      setSelectedArticle(article);
      markRead(article.id);
      addToHistory(article.id);
      if (listFocusModeRef.current) {
        // listFocusMode 中はフォーカスモード切替の代わりに右からスライドする overlay を開く
        setArticleDetailOverlayOpen(true);
      } else if (!isDesktop) {
        setMobilePane("view");
      }
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    [setSelectedArticle, markRead, addToHistory, setMobilePane, isDesktop],
  );

  // listFocusMode が解除されたら overlay も閉じる
  useEffect(() => {
    if (!listFocusMode && articleDetailOverlayOpen) {
      setArticleDetailOverlayOpen(false);
    }
  }, [listFocusMode, articleDetailOverlayOpen]);

  const closeArticleDetailOverlay = useCallback(() => {
    setArticleDetailOverlayOpen(false);
  }, []);

  return { selectArticle, articleDetailOverlayOpen, closeArticleDetailOverlay };
}
