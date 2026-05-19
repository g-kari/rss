import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { isSpeechSupported } from "../lib/auto-read";
import { selectTtsVoice } from "../lib/tts-voice";
import {
  TTS_SILENT_SKIP_ERRORS,
  normalizeWebSpeechError,
  speechSynthesisVoiceToTtsVoice,
  type TtsAdapter,
  type TtsErrorCode,
} from "../lib/tts-adapter";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";
import { useTtsControls } from "./useTtsControls";

// Web Speech API の有無は実行中に変わらないのでモジュール定数にする
const SPEECH_SUPPORTED = isSpeechSupported();

export const TTS_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0] as const;
export type TtsRateStep = (typeof TTS_RATES)[number];

/**
 * Web Speech API (SpeechSynthesis) を使った読み上げ管理フック。`TtsAdapter` (#675 Phase 1a)
 * の `web-speech` engine 実装。
 *
 * - speak(text): テキストを読み上げ開始
 * - pause(): 一時停止
 * - resume(): 再開
 * - stop(): 停止・リセット
 * - cycleRate(): 読み上げ速度を順番に切り替え（0.5x→0.75x→1x→1.25x→1.5x→2x→2.5x→3x→3.5x→4x→0.5x…）
 * - voices / voiceUri / setVoiceUri: ユーザーが選択した voice を localStorage 永続化 (#654)
 *
 * 戻り値の `voices` は `TtsVoice[]` 型 (engine 共通) — 内部で SpeechSynthesisVoice → TtsVoice
 * へ map している。consumer が `SpeechSynthesisVoice` 固有 API に依存しないため、Piper wasm
 * 等の代替 engine と差し替え可能。
 */
export function useSpeechSynthesis(): TtsAdapter {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // #716: 自然完了 (utterance.onend) でのみ increment するカウンタ。
  // 手動 stop (= speechSynthesis.cancel) では increment しない → AutoReadController が
  // 「ユーザーによる中断」と「TTS 自然完了」を区別するための signal。
  const [endedCount, setEndedCount] = useState(0);
  // #743: utterance.onerror 発火を表面化するカウンタ。
  // consumer はこのカウンタ増加でユーザーに toast 等で通知する (silent fail を避ける)。
  // #756: TTS_SILENT_SKIP_ERRORS (canceled / interrupted / audio-busy) では increment しない。
  const [errorCount, setErrorCount] = useState(0);
  // #756: 直近の TTS エラー種別 (consumer が文言切替に使う)。silent skip も lastError には記録。
  const [lastError, setLastError] = useState<TtsErrorCode | null>(null);
  // スマホで DevTools がない状態でも原因切り分けできるよう詳細を expose。silent skip 時は null。
  const [lastErrorDetail, setLastErrorDetail] = useState<TtsAdapter["lastErrorDetail"]>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useSyncedRef(voices);
  const currentTextRef = useRef<string>("");

  // #784 Phase B-2: useTtsControls 経由で rate/voice/volume を集約。
  // onVoiceChange 内で speakRef.current を使うことで循環依存を回避する (Phase B-3 canonical)。
  const speakRef = useRef<(text: string, onBoundary?: (charIndex: number) => void) => void>(
    () => {},
  );

  const {
    rate,
    cycleRate,
    voiceUri,
    setVoiceUri,
    setVoiceUriSilent,
    volume,
    setVolume,
    rateRef,
    voiceUriRef,
    volumeRef,
  } = useTtsControls<TtsRateStep>({
    rates: TTS_RATES,
    defaultRate: 1.0,
    // Web Speech API は rate/voice/volume 変化で再 speak (utterance を作り直し) する仕様。
    onRateChange: () => {
      const text = currentTextRef.current;
      if (text) speakRef.current(text);
    },
    onVoiceChange: () => {
      const text = currentTextRef.current;
      if (text) speakRef.current(text);
    },
    onVolumeChange: () => {
      const text = currentTextRef.current;
      if (text) speakRef.current(text);
    },
  });

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
      utterance.volume = volumeRef.current;
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
        if (utteranceRef.current === utterance) {
          // #716: 自然完了のみ endedCount を increment。手動 stop (cancel) は onend を発火させない。
          setEndedCount((c) => c + 1);
          resetState();
        }
      };
      utterance.onerror = (e) => {
        if (utteranceRef.current === utterance) {
          const code = normalizeWebSpeechError(e.error);
          devError("[useSpeechSynthesis] utterance.onerror", {
            error: e.error,
            normalized: code,
            voice: utterance.voice?.name ?? "(none)",
            voicesLength: voicesRef.current.length,
          });
          setLastError(code);
          // #756: silent skip (canceled / interrupted / audio-busy) では errorCount を increment しない
          if (!TTS_SILENT_SKIP_ERRORS.has(code)) {
            setErrorCount((c) => c + 1);
            setLastErrorDetail({
              code,
              message: `SpeechSynthesisErrorEvent.error="${e.error}"`,
              name: "SpeechSynthesisErrorEvent",
              voiceUri: utterance.voice?.voiceURI ?? null,
              engine: "web-speech",
              occurredAt: new Date().toISOString(),
            });
          }
          // #756 / #784 Phase B-2: voice-unavailable で voiceUri を silent 自動 reset
          // (setVoiceUriSilent は onVoiceChange callback を skip して再 speak を起こさない)
          if (code === "voice-unavailable") {
            setVoiceUriSilent(null);
          }
          resetState();
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useSyncedRef の戻り値は identity 不変 (react-hook-patterns.md 規範)
    [resetState, setVoiceUriSilent],
  );

  // speakRef を最新の speak で更新 (B-3 canonical の手動更新パターン)
  speakRef.current = speak;

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

  // SpeechSynthesisVoice (Web Speech API 固有型) を抽象 TtsVoice に map。
  // 構造的には互換だが、明示的変換で localService 等の余計な field を捨てる。
  const ttsVoices = useMemo(() => voices.map(speechSynthesisVoiceToTtsVoice), [voices]);

  // perf: 戻り値を useMemo で wrap し identity を安定化。
  // App.tsx の `ttsAdapter` useMemo + TtsAdapterProvider value の identity が
  // state 変化時のみ更新されるようにして、全 consumer の不要 re-render を防ぐ。
  return useMemo<TtsAdapter>(
    () => ({
      engine: "web-speech",
      supported: SPEECH_SUPPORTED,
      isPlaying,
      isPaused,
      endedCount,
      errorCount,
      lastError,
      lastErrorDetail,
      rate,
      cycleRate,
      volume,
      setVolume,
      voices: ttsVoices,
      voiceUri,
      setVoiceUri,
      speak,
      pause,
      resume,
      stop,
    }),
    [
      isPlaying,
      isPaused,
      endedCount,
      errorCount,
      lastError,
      lastErrorDetail,
      rate,
      cycleRate,
      volume,
      setVolume,
      ttsVoices,
      voiceUri,
      setVoiceUri,
      speak,
      pause,
      resume,
      stop,
    ],
  );
}
