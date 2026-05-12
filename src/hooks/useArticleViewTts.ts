"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Article } from "../types";
import { buildTtsText } from "../lib/tts-text";
import { formatTtsErrorMessage } from "../lib/tts-adapter";
import { useTtsAdapter } from "../contexts/TtsAdapterContext";
import { useToast } from "../contexts/ToastContext";
import { useEventListener } from "./useEventListener";

export interface ArticleViewTtsResult {
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  /** #716: TTS 自然完了 (`utterance.onend`) の累積カウンタ — 手動 stop では increment しない */
  ttsEndedCount: number;
  ttsRate: number;
  ttsCycleRate: () => void;
  ttsVolume: number;
  ttsCycleVolume: () => void;
  handleTtsToggle: () => void;
  ttsSpeak: (text: string) => void;
  ttsStop: () => void;
  buildTtsText: (
    article: Article,
    processedContent: string | null,
    translatedText?: string | null,
    /** #696: autoMode + autoSummarize で要約結果を読み上げる場合に渡す */
    summaryText?: string | null,
    /** #724: 記事メモを末尾に読み上げる場合に渡す */
    noteText?: string | null,
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
  /** #724: 記事メモ。空文字 / null の場合は本文末尾に何も追加しない */
  noteText?: string | null,
): ArticleViewTtsResult {
  const {
    supported: ttsSupported,
    isPlaying: ttsPlaying,
    isPaused: ttsPaused,
    endedCount: ttsEndedCount,
    errorCount: ttsErrorCount,
    lastError: ttsLastError,
    rate: ttsRate,
    cycleRate: ttsCycleRate,
    volume: ttsVolume,
    setVolume: setTtsVolume,
    speak,
    stop: ttsStop,
  } = useTtsAdapter();
  const toast = useToast();

  // #743/#756: TTS エラー (utterance.onerror) が表面化したときユーザーに lastError 別の toast 通知。
  // engine 側で silent skip 対象 (canceled/interrupted/audio-busy) は errorCount を increment しないため
  // ここまで届かない。formatTtsErrorMessage が null を返した場合は念のため silent skip。
  const prevErrorCountRef = useRef(ttsErrorCount);
  useEffect(() => {
    if (ttsErrorCount > prevErrorCountRef.current) {
      prevErrorCountRef.current = ttsErrorCount;
      const message = formatTtsErrorMessage(ttsLastError);
      if (message) toast.error(message);
    }
  }, [ttsErrorCount, ttsLastError, toast]);

  // #727: TTS 音量 3 段階 cycle (1.0 = full / 0.5 = half / 0.0 = muted)
  const ttsCycleVolume = useCallback(() => {
    const next = ttsVolume >= 0.99 ? 0.5 : ttsVolume >= 0.49 ? 0 : 1;
    setTtsVolume(next);
  }, [ttsVolume, setTtsVolume]);

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
      const text = buildTtsText(article, processedContent, translatedText, null, noteText);
      if (!text.trim()) {
        // #743: 空テキストで silent skip しない (ユーザーには「ボタンが反応しない」に見えるため)
        toast.info("読み上げ可能なテキストがありません (本文取得をお試しください)");
        return;
      }
      speakWithHighlight(text);
    }
  }, [
    ttsPlaying,
    ttsPaused,
    ttsStop,
    speakWithHighlight,
    article,
    processedContent,
    translatedText,
    noteText,
    toast,
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
    ttsEndedCount,
    ttsRate,
    ttsCycleRate,
    ttsVolume,
    ttsCycleVolume,
    handleTtsToggle,
    ttsSpeak: speakWithHighlight,
    ttsStop,
    buildTtsText,
  };
}
