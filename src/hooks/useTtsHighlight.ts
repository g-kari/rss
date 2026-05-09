"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateCharIndexByElapsed,
  findSentenceAtCharIndex,
  selectActiveCharIndex,
  type Sentence,
} from "../lib/tts-sentences";

/**
 * TTS 読み上げハイライト hook (#672 Phase 2)。
 *
 * `useSpeechSynthesis.speak(text, onBoundary)` を経由して charIndex を購読し、
 * 案 C (boundary + 推定融合) で `activeSentenceIndex` を計算する。
 *
 * 副作用は別途呼び出し側で:
 * - DOM の `[data-tts-sentence-idx="${activeSentenceIndex}"]` 要素にクラス付与
 * - `scrollIntoView({ block: "nearest", behavior: "smooth" })`
 *
 * `enabled=false` のとき: 一切のオーバーヘッドなし (interval も起動しない、purefn もスキップ)
 */
export interface TtsHighlightState {
  /** 現在 active なセンテンスの index (sentences 配列内の位置)。-1 = 非アクティブ */
  activeSentenceIndex: number;
  /** speak 呼び出し時に utterance.onboundary に注入するコールバック (charIndex を内部 state に反映) */
  handleBoundary: (charIndex: number) => void;
  /** speak 開始タイミングを記録 (経過時間推定の起点) */
  markSpeakStart: () => void;
  /** TTS 停止時に state をクリア (activeSentenceIndex = -1) */
  reset: () => void;
}

export function useTtsHighlight(
  sentences: Sentence[],
  rate: number,
  isPlaying: boolean,
  enabled: boolean,
): TtsHighlightState {
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const boundaryCharIndexRef = useRef<number | null>(null);
  const boundaryAtRef = useRef<number | null>(null);
  const speakStartAtRef = useRef<number | null>(null);

  const handleBoundary = useCallback((charIndex: number) => {
    boundaryCharIndexRef.current = charIndex;
    boundaryAtRef.current = Date.now();
  }, []);

  const markSpeakStart = useCallback(() => {
    speakStartAtRef.current = Date.now();
    boundaryCharIndexRef.current = null;
    boundaryAtRef.current = null;
    setActiveSentenceIndex(-1);
  }, []);

  const reset = useCallback(() => {
    speakStartAtRef.current = null;
    boundaryCharIndexRef.current = null;
    boundaryAtRef.current = null;
    setActiveSentenceIndex(-1);
  }, []);

  // 100ms 間隔で activeSentenceIndex を更新
  useEffect(() => {
    if (!enabled || !isPlaying || sentences.length === 0) return;
    const tick = () => {
      const now = Date.now();
      const startedAt = speakStartAtRef.current ?? now;
      const elapsed = now - startedAt;
      const estimated = estimateCharIndexByElapsed(elapsed, rate);
      const active = selectActiveCharIndex(
        boundaryCharIndexRef.current,
        boundaryAtRef.current,
        estimated,
        now,
      );
      const idx = findSentenceAtCharIndex(sentences, active);
      setActiveSentenceIndex((prev) => (prev === idx ? prev : idx));
    };
    tick(); // 初回即実行
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [enabled, isPlaying, sentences, rate]);

  // 停止時に reset
  useEffect(() => {
    if (!isPlaying) {
      setActiveSentenceIndex(-1);
    }
  }, [isPlaying]);

  return { activeSentenceIndex, handleBoundary, markSpeakStart, reset };
}
