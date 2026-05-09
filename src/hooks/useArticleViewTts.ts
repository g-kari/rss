"use client";

import { useCallback, useEffect, type RefObject } from "react";
import type { Article } from "../types";
import { buildTtsText } from "../lib/tts-text";
import { useTtsAdapter } from "../contexts/TtsAdapterContext";
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
  buildTtsText: (
    article: Article,
    processedContent: string | null,
    translatedText?: string | null,
  ) => string;
}

export function useArticleViewTts(
  article: Article | null,
  processedContent: string | null,
  translatedText?: string | null,
  /** speak 時に utterance.onboundary に注入する callback の ref (#672 Phase 2) */
  onBoundaryRef?: RefObject<((charIndex: number) => void) | null>,
  /** speak 開始時に呼ぶ callback の ref (#672 Phase 2) */
  onSpeakStartRef?: RefObject<(() => void) | null>,
): ArticleViewTtsResult {
  const {
    supported: ttsSupported,
    isPlaying: ttsPlaying,
    isPaused: ttsPaused,
    rate: ttsRate,
    cycleRate: ttsCycleRate,
    speak,
    stop: ttsStop,
  } = useTtsAdapter();

  // 記事切り替え時にTTSを停止
  useEffect(() => {
    ttsStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ttsStop を deps に入れると再生→停止→再生のループが発生する
  }, [article?.id]);

  // speak をハイライト連携 (boundary + speak 開始通知) で wrap する (#672 Phase 2)
  const speakWithHighlight = useCallback(
    (text: string) => {
      onSpeakStartRef?.current?.();
      const onBoundary = onBoundaryRef?.current ?? undefined;
      speak(text, onBoundary);
    },
    [speak, onBoundaryRef, onSpeakStartRef],
  );

  const handleTtsToggle = useCallback(() => {
    if (ttsPlaying || ttsPaused) {
      ttsStop();
    } else {
      if (!article) return;
      const text = buildTtsText(article, processedContent, translatedText);
      if (text.trim()) speakWithHighlight(text);
    }
  }, [
    ttsPlaying,
    ttsPaused,
    ttsStop,
    speakWithHighlight,
    article,
    processedContent,
    translatedText,
  ]);

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
    ttsSpeak: speakWithHighlight,
    ttsStop,
    buildTtsText,
  };
}
