"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Article, FeedGroup } from "../types";

interface FeedSelectionState {
  selectedFeedId: string | null;
  setSelectedFeedId: (id: string | null) => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  selectedArticle: Article | null;
  setSelectedArticle: (article: Article | null) => void;
  selectedCollectionId: string | null;
  setSelectedCollectionId: (id: string | null) => void;
  /**
   * フィードを選択して同時に表示中の記事をクリアする (#650 Step 1n)。
   * `useKeyboardNav` のフィード移動・FeedSidebar の切替で「同じ記事が違うフィードに残る」
   * 違和感を避けるためのアトミック操作。
   */
  selectFeedClearingArticle: (id: string | null) => void;
  /**
   * フィード/グループ/記事の選択を全てクリアする (#650 Step 1n)。
   * activeFeedView 変更時など、選択コンテキストごと切り替えるシーンで使う。
   */
  clearFeedGroupArticleSelection: () => void;
}

/**
 * フィード / グループ / タグ / コレクション / 記事の選択 state を集約管理する hook。複合操作 (`selectFeedClearingArticle` / `clearFeedGroupArticleSelection`) も提供。
 * @param articles - 全記事配列 (selected article の resolve に使用)
 * @param feedGroups - 全フィードグループ配列
 * @returns `FeedSelectionState` (各 setter + 複合 callback)
 */
export function useFeedSelection(articles: Article[], feedGroups: FeedGroup[]): FeedSelectionState {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(() =>
    searchParams.get("feed"),
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    searchParams.get("feed") ? null : searchParams.get("group"),
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(() =>
    searchParams.get("feed") || searchParams.get("group") ? null : searchParams.get("tag"),
  );
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const pendingArticleIdRef = useRef<string | null>(searchParams.get("article"));

  // 選択状態を URL クエリパラメータに同期（300ms デバウンス）
  const urlSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    urlSyncTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (selectedFeedId) params.set("feed", selectedFeedId);
      if (selectedGroupId) params.set("group", selectedGroupId);
      if (selectedTag && !selectedFeedId && !selectedGroupId) params.set("tag", selectedTag);
      if (selectedArticle) params.set("article", selectedArticle.id);
      const search = params.toString();
      router.replace(search ? `/?${search}` : "/");
    }, 300);
    return () => {
      if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    };
  }, [selectedFeedId, selectedGroupId, selectedTag, selectedArticle, router]);

  // 記事ロード完了後に URL の article パラメータを復元
  useEffect(() => {
    if (!pendingArticleIdRef.current || articles.length === 0) return;
    const article = articles.find((a) => a.id === pendingArticleIdRef.current);
    if (article) {
      setSelectedArticle(article);
    }
    pendingArticleIdRef.current = null;
  }, [articles]);

  // 削除されたグループが選択中の場合は解除する
  useEffect(() => {
    if (!selectedGroupId) return;
    if (!feedGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [selectedGroupId, feedGroups]);

  const selectFeedClearingArticle = useCallback((id: string | null) => {
    setSelectedFeedId(id);
    setSelectedArticle(null);
  }, []);

  const clearFeedGroupArticleSelection = useCallback(() => {
    setSelectedFeedId(null);
    setSelectedGroupId(null);
    setSelectedArticle(null);
  }, []);

  return {
    selectedFeedId,
    setSelectedFeedId,
    selectedGroupId,
    setSelectedGroupId,
    selectedTag,
    setSelectedTag,
    selectedArticle,
    setSelectedArticle,
    selectedCollectionId,
    setSelectedCollectionId,
    selectFeedClearingArticle,
    clearFeedGroupArticleSelection,
  };
}
