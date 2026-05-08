"use client";

import { useCallback, useEffect } from "react";
import type { Article } from "../types";
import { toPlainText } from "../lib/html";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useEventListener } from "./useEventListener";

export interface ArticleViewTtsResult {
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  ttsRate: number;
  ttsCycleRate: () => void;
  handleTtsToggle: () => void;
  ttsSpeak: (text: string) => void;
  ttsStop: () => void;
  buildTtsText: (article: Article, processedContent: string | null) => string;
}

function buildTtsText(article: Article, processedContent: string | null): string {
  return [article.title, toPlainText(processedContent ?? article.summary ?? "")]
    .filter(Boolean)
    .join("\n\n");
}

export function useArticleViewTts(
  article: Article | null,
  processedContent: string | null,
): ArticleViewTtsResult {
  const {
    supported: ttsSupported,
    isPlaying: ttsPlaying,
    isPaused: ttsPaused,
    rate: ttsRate,
    cycleRate: ttsCycleRate,
    speak,
    stop: ttsStop,
  } = useSpeechSynthesis();

  // 記事切り替え時にTTSを停止
  useEffect(() => {
    ttsStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ttsStop を deps に入れると再生→停止→再生のループが発生する
  }, [article?.id]);

  const handleTtsToggle = useCallback(() => {
    if (ttsPlaying || ttsPaused) {
      ttsStop();
    } else {
      if (!article) return;
      const text = buildTtsText(article, processedContent);
      if (text.trim()) speak(text);
    }
  }, [ttsPlaying, ttsPaused, ttsStop, speak, article, processedContent]);

  // Shift+P キーボードショートカット
  useEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (!ttsSupported) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== "P") return;
      handleTtsToggle();
    },
    document,
  );

  return {
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    ttsRate,
    ttsCycleRate,
    handleTtsToggle,
    ttsSpeak: speak,
    ttsStop,
    buildTtsText,
  };
}
