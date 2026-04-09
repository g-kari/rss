import { useState, useCallback, useEffect, useRef } from "react";

// Web Speech API の有無は実行中に変わらないのでモジュール定数にする
const SPEECH_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Web Speech API (SpeechSynthesis) を使った読み上げ管理フック。
 * - speak(text): テキストを読み上げ開始
 * - pause(): 一時停止
 * - resume(): 再開
 * - stop(): 停止・リセット
 */
export function useSpeechSynthesis() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  // アンマウント時にキャンセル
  useEffect(() => {
    return () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    };
  }, []);

  return { supported: SPEECH_SUPPORTED, isPlaying, isPaused, speak, pause, resume, stop };
}
