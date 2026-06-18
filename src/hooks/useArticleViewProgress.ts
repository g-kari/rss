"use client";

import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from "react";
import { useSyncedRef } from "./useSyncedRef";
import { useReadingProgress, loadProgress } from "./useReadingProgress";

interface ArticleViewProgressDeps {
  articleId: string | undefined;
  contentRef: RefObject<HTMLDivElement | null>;
  autoReadEnabled: boolean;
  autoReadThreshold: number;
  onAutoMarkRead?: (articleId: string) => void;
}

interface ArticleViewProgressResult {
  progressBarRef: RefObject<HTMLDivElement | null>;
  handleScroll: (e: UIEvent<HTMLElement>) => void;
  /** #1149: scroll progress 0-100 を react state として expose (FAB「先頭へ戻る」表示判定用) */
  progress: number;
}

export function useArticleViewProgress(deps: ArticleViewProgressDeps): ArticleViewProgressResult {
  const { articleId, contentRef, autoReadEnabled, autoReadThreshold, onAutoMarkRead } = deps;

  const progressBarRef = useRef<HTMLDivElement>(null);
  // #1149: FAB「先頭へ戻る」表示判定用に progress を react state として expose。
  // progressBar の DOM 直接書込 (perf 維持) と並行して setState で render trigger。
  const [progress, setProgress] = useState<number>(0);
  const autoReadEnabledRef = useSyncedRef(autoReadEnabled);
  const autoReadThresholdRef = useSyncedRef(autoReadThreshold);
  const onAutoMarkReadRef = useSyncedRef(onAutoMarkRead);
  const articleIdRef = useSyncedRef(articleId);

  // 初期進捗バーの復元
  useEffect(() => {
    const pct = articleId ? (loadProgress(articleId)?.progress ?? 0) : 0;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct}%`;
      progressBarRef.current.style.display = pct > 0 ? "" : "none";
    }
    setProgress(pct);
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
      setProgress(pct);
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
  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  const handleScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const scrollable = el.scrollHeight - el.clientHeight;
      const pct = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 0;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct}%`;
        progressBarRef.current.style.display = pct > 0 ? "" : "none";
      }
      setProgress(pct);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { progressBarRef, handleScroll, progress };
}
