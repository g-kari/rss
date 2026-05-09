import { useState, useCallback, useEffect, useRef } from "react";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import { cycleValue } from "../lib/article-utils";
import { isSpeechSupported } from "../lib/auto-read";
import { selectTtsVoice } from "../lib/tts-voice";
import { useSyncedRef } from "./useSyncedRef";

// Web Speech API の有無は実行中に変わらないのでモジュール定数にする
const SPEECH_SUPPORTED = isSpeechSupported();

export const TTS_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
export type TtsRate = (typeof TTS_RATES)[number];

function loadRate(): TtsRate {
  const v = parseFloat(storageGet(STORAGE_KEYS.TTS_RATE) ?? "");
  return (TTS_RATES as readonly number[]).includes(v) ? (v as TtsRate) : 1.0;
}

function loadVoiceUri(): string | null {
  return storageGet(STORAGE_KEYS.TTS_VOICE_URI) ?? null;
}

/**
 * Web Speech API (SpeechSynthesis) を使った読み上げ管理フック。
 * - speak(text): テキストを読み上げ開始
 * - pause(): 一時停止
 * - resume(): 再開
 * - stop(): 停止・リセット
 * - cycleRate(): 読み上げ速度を順番に切り替え（0.5x→0.75x→1x→1.25x→1.5x→2x→0.5x…）
 * - voices / voiceUri / setVoiceUri: ユーザーが選択した voice を localStorage 永続化 (#654)
 */
export function useSpeechSynthesis() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState<TtsRate>(loadRate);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUriState] = useState<string | null>(loadVoiceUri);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const rateRef = useSyncedRef(rate);
  const voicesRef = useSyncedRef(voices);
  const voiceUriRef = useSyncedRef(voiceUri);
  const currentTextRef = useRef<string>("");

  // voice 一覧を非同期に取得 (Chrome は voiceschanged イベントで遅延通知)
  useEffect(() => {
    if (!SPEECH_SUPPORTED) return;
    const updateVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  const resetState = useCallback(() => {
    utteranceRef.current = null;
    currentTextRef.current = "";
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    if (!SPEECH_SUPPORTED) return;
    window.speechSynthesis.cancel();
    resetState();
  }, [resetState]);

  const speak = useCallback(
    (text: string, onBoundary?: (charIndex: number) => void) => {
      if (!SPEECH_SUPPORTED) return;
      currentTextRef.current = text;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rateRef.current;
      // ユーザー指定 voice (or 言語マッチで自動選択)
      const docLang =
        typeof document !== "undefined" ? document.documentElement.lang || null : null;
      const selected = selectTtsVoice(voicesRef.current, voiceUriRef.current, docLang);
      if (selected) utterance.voice = selected;
      utteranceRef.current = utterance;

      utterance.onstart = () => {
        setIsPlaying(true);
        setIsPaused(false);
      };
      // キャンセルされた旧 utterance の非同期コールバックが新 utterance の state を壊さないよう identity ガード
      utterance.onend = () => {
        if (utteranceRef.current === utterance) resetState();
      };
      utterance.onerror = () => {
        if (utteranceRef.current === utterance) resetState();
      };
      utterance.onpause = () => setIsPaused(true);
      utterance.onresume = () => setIsPaused(false);
      // #659: ハイライト用 charIndex 通知 (Chrome ローカル音声などで発火、リモート音声では発火しない)
      if (onBoundary) {
        utterance.onboundary = (event: SpeechSynthesisEvent) => {
          if (utteranceRef.current === utterance) onBoundary(event.charIndex);
        };
      }

      window.speechSynthesis.speak(utterance);
    },
    [resetState, rateRef, voicesRef, voiceUriRef],
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
    const next = cycleValue(TTS_RATES, rateRef.current);
    storageSet(STORAGE_KEYS.TTS_RATE, String(next));
    rateRef.current = next;
    setRate(next);
    const text = currentTextRef.current;
    if (text) speak(text);
  }, [speak, rateRef]);

  /**
   * 読み上げ voice を設定 (localStorage に永続化)。
   * 再生中ならその場で voice を切り替えて再生し直す。
   * `null` を渡すと自動選択 (言語マッチ → default → 先頭) に戻す。
   */
  const setVoiceUri = useCallback(
    (uri: string | null) => {
      storageSet(STORAGE_KEYS.TTS_VOICE_URI, uri ?? "");
      voiceUriRef.current = uri;
      setVoiceUriState(uri);
      const text = currentTextRef.current;
      if (text) speak(text);
    },
    [speak, voiceUriRef],
  );

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
    voices,
    voiceUri,
    setVoiceUri,
    speak,
    pause,
    resume,
    stop,
  };
}
