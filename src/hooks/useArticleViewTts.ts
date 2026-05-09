"use client";

import { useCallback, useEffect } from "react";
import type { Article } from "../types";
import { buildTtsText } from "../lib/tts-text";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useEventListener } from "./useEventListener";

export interface ArticleViewTtsResult {
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  ttsRate: number;
  ttsCycleRate: () => void;
  /** Web Speech API から列挙された全 voice (#654) */
  ttsVoices: SpeechSynthesisVoice[];
  /** 現在ユーザーが選択している voice URI (null=自動選択) */
  ttsVoiceUri: string | null;
  /** voice を切り替える (null で自動選択に戻す) */
  setTtsVoiceUri: (uri: string | null) => void;
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
): ArticleViewTtsResult {
  const {
    supported: ttsSupported,
    isPlaying: ttsPlaying,
    isPaused: ttsPaused,
    rate: ttsRate,
    cycleRate: ttsCycleRate,
    voices: ttsVoices,
    voiceUri: ttsVoiceUri,
    setVoiceUri: setTtsVoiceUri,
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
      const text = buildTtsText(article, processedContent, translatedText);
      if (text.trim()) speak(text);
    }
  }, [ttsPlaying, ttsPaused, ttsStop, speak, article, processedContent, translatedText]);

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
    ttsVoices,
    ttsVoiceUri,
    setTtsVoiceUri,
    handleTtsToggle,
    ttsSpeak: speak,
    ttsStop,
    buildTtsText,
  };
}
