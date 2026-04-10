import { useState, useCallback, useEffect, useRef } from "react";

// Web Speech API の有無は実行中に変わらないのでモジュール定数にする
const SPEECH_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

const STORAGE_KEY = "tts-rate";
export const TTS_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
export type TtsRate = (typeof TTS_RATES)[number];

function loadRate(): TtsRate {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
    if ((TTS_RATES as readonly number[]).includes(v)) return v as TtsRate;
  } catch {}
  return 1.0;
}

/**
 * Web Speech API (SpeechSynthesis) を使った読み上げ管理フック。
 * - speak(text): テキストを読み上げ開始
 * - pause(): 一時停止
 * - resume(): 再開
 * - stop(): 停止・リセット
 * - cycleRate(): 読み上げ速度を順番に切り替え（0.5x→0.75x→1x→1.25x→1.5x→2x→0.5x…）
 */
export function useSpeechSynthesis() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState<TtsRate>(loadRate);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  const resetState = useCallback(() => {
    utteranceRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    if (!SPEECH_SUPPORTED) return;
    window.speechSynthesis.cancel();
    resetState();
  }, [resetState]);

  const speak = useCallback(
    (text: string) => {
      if (!SPEECH_SUPPORTED) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rateRef.current;
      utteranceRef.current = utterance;

      utterance.onstart = () => {
        setIsPlaying(true);
        setIsPaused(false);
      };
      utterance.onend = resetState;
      utterance.onerror = resetState;
      utterance.onpause = () => setIsPaused(true);
      utterance.onresume = () => setIsPaused(false);

      window.speechSynthesis.speak(utterance);
    },
    [resetState],
  );

  const pause = useCallback(() => {
    if (!SPEECH_SUPPORTED || !isPlaying) return;
    window.speechSynthesis.pause();
  }, [isPlaying]);

  const resume = useCallback(() => {
    if (!SPEECH_SUPPORTED || !isPaused) return;
    window.speechSynthesis.resume();
  }, [isPaused]);

  const cycleRate = useCallback(() => {
    setRate((prev) => {
      const idx = TTS_RATES.indexOf(prev);
      const next = TTS_RATES[(idx + 1) % TTS_RATES.length];
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  // アンマウント時にキャンセル
  useEffect(() => {
    return () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    };
  }, []);

  return {
    supported: SPEECH_SUPPORTED,
    isPlaying,
    isPaused,
    rate,
    cycleRate,
    speak,
    pause,
    resume,
    stop,
  };
}
