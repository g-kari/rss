"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  computeProgress,
  clampProgress,
  buildAnchorSelector,
  scopeAnchorToContent,
} from "../lib/reading-progress";
import { STORAGE_KEYS, loadJsonObject, saveJson } from "../lib/storage";
import { useSyncedRef } from "./useSyncedRef";

interface ProgressEntry {
  progress: number;
  anchor: string;
}

// #1146 Phase 4: corrupted localStorage 由来の primitive / 型不正値で property access が
// TypeError → ErrorBoundary 発火するのを防ぐ。null も valid (進捗未保存状態)。
function isProgressEntryOrNull(v: unknown): v is ProgressEntry | null {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.progress === "number" && typeof e.anchor === "string";
}

/**
 * Module-level cache で `loadProgress` の localStorage.getItem + JSON.parse を回避。
 *
 * `useArticleListItemProps.progressMap` が `filtered` 変化毎 (j/k spam + unreadOnly 時
 * 頻繁) に articles 全件 loadProgress を呼ぶ hot path で、300-500 記事 × sync localStorage
 * read + JSON parse = 3-15ms/keystroke の main-thread block が発生していた。
 *
 * cache 一貫性: `saveProgress` (本 module 内 sole writer、`STORAGE_KEYS.READING_PROGRESS_PREFIX`
 * の別 writer なし) で write と同時に cache 更新。cross-tab 書き込みでは stale 状態が
 * 起きるが、progress bar 表示の UX 影響は軽微 (次 keystroke で再 read)。
 */
const progressCache = new Map<string, ProgressEntry | null>();

function saveProgress(articleId: string, entry: ProgressEntry): void {
  saveJson(`${STORAGE_KEYS.READING_PROGRESS_PREFIX}${articleId}`, entry);
  progressCache.set(articleId, entry);
}

export function loadProgress(articleId: string): ProgressEntry | null {
  const cached = progressCache.get(articleId);
  if (cached !== undefined) return cached; // null もヒット (undefined = 未 populated)
  const value = loadJsonObject<ProgressEntry | null>(
    `${STORAGE_KEYS.READING_PROGRESS_PREFIX}${articleId}`,
    null,
    isProgressEntryOrNull,
  );
  progressCache.set(articleId, value);
  return value;
}

// ── フック ────────────────────────────────────────────────────

interface UseReadingProgressOptions {
  /** 追跡対象の記事 ID */
  articleId: string | undefined;
  /** article-content の直下要素を取得するための ref */
  contentRef: RefObject<HTMLElement | null>;
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
}: UseReadingProgressOptions): void {
  // 現在の最大可視インデックスを ref で管理（クロージャ汚染防止）
  const maxIndexRef = useRef<number>(0);
  const onProgressChangeRef = useSyncedRef(onProgressChange);

  // 記事切り替え時にリセット + アンカー復元
  useEffect(() => {
    if (!articleId) return;
    maxIndexRef.current = 0;

    // 保存済みアンカーにスクロール復元
    const saved = loadProgress(articleId);
    if (saved?.anchor) {
      // DOM 更新後に実行
      const timer = setTimeout(() => {
        // contentRef.current (= .article-content 自身) を起点に :scope 相対で検索する。
        // document.querySelector だと listFocusMode で .article-content が複数存在するとき
        // 別記事の要素にマッチしうる (#scope-anchor)。不正な anchor (legacy/corrupt) は無視。
        const root = contentRef.current;
        if (!root) return;
        try {
          root
            .querySelector(scopeAnchorToContent(saved.anchor))
            ?.scrollIntoView({ block: "start", behavior: "instant" });
        } catch {
          /* 不正な anchor selector は無視 */
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [articleId]);

  // IntersectionObserver で可視インデックスを追跡
  //
  // #888 Bug 2 (IntersectionObserver attach タイミング): articleId 変更時、
  // contentRef.current.children は dangerouslySetInnerHTML が非同期で commit される
  // 前にこの effect が走る場合があり、children.length === 0 で早期 return して
  // IntersectionObserver が永遠に attach されない。MutationObserver で contentRef の
  // childList を監視し、children が後から現れた時点で IntersectionObserver を
  // 再 attach することで構造的に解消する。
  useEffect(() => {
    if (!articleId || !contentRef.current) return;

    const container = contentRef.current;
    let intersectionObserver: IntersectionObserver | null = null;

    const attach = (): void => {
      const children = Array.from(container.children) as HTMLElement[];
      if (children.length === 0) return;

      intersectionObserver?.disconnect();
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const idx = children.indexOf(entry.target as HTMLElement);
            if (idx > maxIndexRef.current) {
              maxIndexRef.current = idx;
              const raw = computeProgress(idx, children.length);
              const clamped = clampProgress(raw);
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
        intersectionObserver.observe(child);
      }
    };

    attach();

    // children が後から DOM に追加されたら再 attach (#888 Bug 2)
    const mutationObserver = new MutationObserver(attach);
    mutationObserver.observe(container, { childList: true });

    return () => {
      intersectionObserver?.disconnect();
      mutationObserver.disconnect();
    };
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);
}
