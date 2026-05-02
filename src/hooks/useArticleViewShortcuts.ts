"use client";

import { useEffect, useRef } from "react";
import type { Article } from "../types";
import type { AiOperationResult } from "./useArticleAi";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import { isLikelyJapanese } from "../lib/article-utils";
import { toPlainText } from "../lib/html";

export interface ArticleViewShortcutsDeps {
  article: Article | null;
  storedContent: string | null;
  fetching: boolean;
  fetchFullContent: (cb?: (content: string) => void) => Promise<void> | void;
  aiResult: string | null;
  aiLoading: boolean;
  doRunAi: (link: string, id: string) => void;
  resetAi: () => void;
  handleTranslate: () => void;
  mainRef: React.RefObject<HTMLElement | null>;
  autoTranslate: boolean;
  translateResult: AiOperationResult | null;
  translateLoading: boolean;
}

export function useArticleViewShortcuts(deps: ArticleViewShortcutsDeps): void {
  const {
    article,
    storedContent,
    fetching,
    fetchFullContent,
    aiResult,
    aiLoading,
    doRunAi,
    resetAi,
    handleTranslate,
    mainRef,
    autoTranslate,
    translateResult,
    translateLoading,
  } = deps;

  // v/a/z/space キーボードショートカット
  const shortcutRef = useSyncedRef({
    articleLink: article?.link,
    articleId: article?.id,
    storedContent,
    fetching,
    fetchFullContent,
    aiResult,
    aiLoading,
    doRunAi,
    resetAi,
    handleTranslate,
  });

  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = shortcutRef.current;
      if (e.key === "v" && s.articleLink && !s.storedContent && !s.fetching) {
        void s.fetchFullContent();
      }
      if (e.key === "a" && s.articleLink) {
        if (s.aiResult) {
          s.resetAi();
        } else if (!s.aiLoading && !s.fetching) {
          void s.doRunAi(s.articleLink, s.articleId!);
        }
      }
      if (e.key === "z" && s.articleLink) {
        s.handleTranslate();
      }
      if (e.key === " ") {
        const el = mainRef.current;
        if (!el) return;
        e.preventDefault();
        el.scrollBy({
          top: e.shiftKey ? -el.clientHeight * 0.8 : el.clientHeight * 0.8,
          behavior: "smooth",
        });
      }
    },
    document,
  );

  // 自動翻訳
  const autoTranslateTriggered = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoTranslate || !article?.id || !storedContent || translateResult || translateLoading)
      return;
    if (autoTranslateTriggered.current === article.id) return;
    if (isLikelyJapanese(toPlainText(storedContent).slice(0, 200))) return;
    autoTranslateTriggered.current = article.id;
    handleTranslate();
  }, [
    autoTranslate,
    article?.id,
    storedContent,
    translateResult,
    translateLoading,
    handleTranslate,
  ]);
}
