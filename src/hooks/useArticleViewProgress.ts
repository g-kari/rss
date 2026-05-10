"use client";

import { useCallback, useEffect, useRef, type RefObject, type UIEvent } from "react";
import { useSyncedRef } from "./useSyncedRef";
import { useReadingProgress, loadProgress } from "./useReadingProgress";

export interface ArticleViewProgressDeps {
  articleId: string | undefined;
  contentRef: RefObject<HTMLDivElement | null>;
  autoReadEnabled: boolean;
  autoReadThreshold: number;
  onAutoMarkRead?: (articleId: string) => void;
}

export interface ArticleViewProgressResult {
  progressBarRef: RefObject<HTMLDivElement | null>;
  handleScroll: (e: UIEvent<HTMLElement>) => void;
}

export function useArticleViewProgress(deps: ArticleViewProgressDeps): ArticleViewProgressResult {
  const { articleId, contentRef, autoReadEnabled, autoReadThreshold, onAutoMarkRead } = deps;

  const progressBarRef = useRef<HTMLDivElement>(null);
  const autoReadEnabledRef = useSyncedRef(autoReadEnabled);
  const autoReadThresholdRef = useSyncedRef(autoReadThreshold);
  const onAutoMarkReadRef = useSyncedRef(onAutoMarkRead);
  const articleIdRef = useSyncedRef(articleId);

  // 初期進捗バーの復元
  useEffect(() => {
    if (progressBarRef.current) {
      const pct = articleId ? (loadProgress(articleId)?.progress ?? 0) : 0;
      progressBarRef.current.style.width = `${pct}%`;
      progressBarRef.current.style.display = pct > 0 ? "" : "none";
    }
  }, [articleId]);

  // IntersectionObserver ベースの読書進捗トラッキング
  useReadingProgress({
    articleId,
    contentRef,
    onProgressChange: (pct) => {
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct}%`;
        progressBarRef.current.style.display = pct > 0 ? "" : "none";
      }
      const currentArticleId = articleIdRef.current;
      if (
        autoReadEnabledRef.current &&
        pct >= autoReadThresholdRef.current &&
        currentArticleId &&
        onAutoMarkReadRef.current
      ) {
        onAutoMarkReadRef.current(currentArticleId);
      }
    },
  });

  // スクロールイベントベースの進捗更新
  const handleScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const scrollable = el.scrollHeight - el.clientHeight;
      const progress = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 0;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${progress}%`;
        progressBarRef.current.style.display = progress > 0 ? "" : "none";
      }
      const currentArticleId = articleIdRef.current;
      if (
        autoReadEnabledRef.current &&
        progress >= autoReadThresholdRef.current &&
        currentArticleId &&
        onAutoMarkReadRef.current
      ) {
        onAutoMarkReadRef.current(currentArticleId);
      }
    },
    [articleIdRef, autoReadEnabledRef, autoReadThresholdRef, onAutoMarkReadRef],
  );

  return { progressBarRef, handleScroll };
}
