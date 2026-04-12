"use client";

import { useEffect, useRef } from "react";
import { computeProgress, clampProgress, buildAnchorSelector } from "../lib/reading-progress";
import { storageGet, storageSet } from "../lib/storage";

// ── localStorage キー ─────────────────────────────────────────
const PREFIX = "rss-reading-progress:";

interface ProgressEntry {
  progress: number;
  anchor: string;
}

function saveProgress(articleId: string, entry: ProgressEntry): void {
  storageSet(`${PREFIX}${articleId}`, JSON.stringify(entry));
}

export function loadProgress(articleId: string): ProgressEntry | null {
  const raw = storageGet(`${PREFIX}${articleId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProgressEntry;
  } catch {
    return null;
  }
}

// ── フック ────────────────────────────────────────────────────

interface UseReadingProgressOptions {
  /** 追跡対象の記事 ID */
  articleId: string | undefined;
  /** article-content の直下要素を取得するための ref */
  contentRef: React.RefObject<HTMLElement | null>;
  /** 進捗が変化したときに呼ばれるコールバック */
  onProgressChange?: (progress: number) => void;
}

/**
 * IntersectionObserver で記事の読書進捗を追跡するフック。
 *
 * - 記事本文の直下要素が 50% 以上ビューポートに入ったらインデックスを更新
 * - progress / anchor を localStorage に保存
 * - 記事を開いたとき保存済みアンカーにスクロール復元する
 */
export function useReadingProgress({
  articleId,
  contentRef,
  onProgressChange,
}: UseReadingProgressOptions): { progress: number } {
  // 現在の最大可視インデックスを ref で管理（クロージャ汚染防止）
  const maxIndexRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const onProgressChangeRef = useRef(onProgressChange);
  onProgressChangeRef.current = onProgressChange;

  // 記事切り替え時にリセット + アンカー復元
  useEffect(() => {
    if (!articleId) return;
    maxIndexRef.current = 0;
    progressRef.current = 0;

    // 保存済みアンカーにスクロール復元
    const saved = loadProgress(articleId);
    if (saved?.anchor) {
      // DOM 更新後に実行
      const timer = setTimeout(() => {
        const el = document.querySelector(saved.anchor);
        el?.scrollIntoView({ block: "start", behavior: "instant" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [articleId]);

  // IntersectionObserver で可視インデックスを追跡
  useEffect(() => {
    if (!articleId || !contentRef.current) return;

    const container = contentRef.current;
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = children.indexOf(entry.target as HTMLElement);
          if (idx > maxIndexRef.current) {
            maxIndexRef.current = idx;
            const raw = computeProgress(idx, children.length);
            const clamped = clampProgress(raw);
            progressRef.current = clamped;
            const anchor = buildAnchorSelector(idx);
            if (articleId) {
              saveProgress(articleId, { progress: clamped, anchor });
            }
            onProgressChangeRef.current?.(clamped);
          }
        }
      },
      { threshold: 0.5 },
    );

    for (const child of children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [articleId, contentRef]);

  return { progress: progressRef.current };
}
