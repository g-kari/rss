import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import { cycleValue } from "../lib/article-utils";
import { piperVoiceToTtsVoice } from "../lib/piper-adapter";
import type { TtsAdapter, TtsVoice } from "../lib/tts-adapter";
import { clampTtsVolume, parseTtsVolume } from "../lib/tts-volume";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";

/**
 * Piper TTS wasm engine (`@mintplex-labs/piper-tts-web`) を用いた読み上げ管理 hook (#674 Phase 2a-part2)。
 *
 * `TtsAdapter` interface を実装し、`useSpeechSynthesis` と同じ契約を満たす。AppProviders 側で
 * 設定値に応じて切替可能にする (UI 配線は Phase 2b 別サイクル予定)。
 *
 * 設計差分 (Web Speech との比較):
 * - speak() は engine 内部で text → wav Blob を非同期生成し、`<audio>` 要素で再生する非同期パイプライン
 * - rate は `audio.playbackRate` で実現 (predict 後でも変更可能、Web Speech と違い再 utterance 不要)
 * - volume は `audio.volume` でリアルタイム反映
 * - onBoundary は `tts-sentences` の `estimateCharIndexByElapsed` を setInterval で発火する擬似実装
 *   (Piper には boundary 通知 API がないため、経過時間 × 推定 cps で charIndex を進める)
 * - voices は mount 時に library から取得 (HuggingFace fetch → OPFS fallback)
 * - ライブラリは dynamic import で lazy load (Cloudflare Workers ビルドへの影響を避ける)
 */
export const PIPER_TTS_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0] as const;
export type PiperTtsRate = (typeof PIPER_TTS_RATES)[number];

const ESTIMATED_CPS = 12; // 日本語/英語平均の推定 char-per-second (boundary 擬似発火用)
const BOUNDARY_TICK_MS = 100; // 経過時間 → charIndex 更新の tick

function loadRate(): PiperTtsRate {
  const v = parseFloat(storageGet(STORAGE_KEYS.TTS_RATE) ?? "");
  return (PIPER_TTS_RATES as readonly number[]).includes(v) ? (v as PiperTtsRate) : 1.0;
}

function loadVoiceUri(): string | null {
  return storageGet(STORAGE_KEYS.TTS_VOICE_URI) ?? null;
}

function loadVolume(): number {
  return parseTtsVolume(storageGet(STORAGE_KEYS.TTS_VOLUME));
}

/** voiceURI が `piper:` prefix を持つときに voiceId 部分を返す。Web Speech voice は null */
function extractPiperVoiceId(voiceUri: string | null): string | null {
  if (!voiceUri || !voiceUri.startsWith("piper:")) return null;
  return voiceUri.slice("piper:".length);
}

interface PiperLib {
  predict: (config: { text: string; voiceId: string }) => Promise<Blob>;
  voices: () => Promise<Array<{ key: string }>>;
}

/** dynamic import で library を 1 回だけ読み込む (singleton キャッシュ) */
let piperLibPromise: Promise<PiperLib> | null = null;
function loadPiperLib(): Promise<PiperLib> {
  if (!piperLibPromise) {
    piperLibPromise = import("@mintplex-labs/piper-tts-web").then(
      (mod) => ({ predict: mod.predict, voices: mod.voices }) as PiperLib,
    );
  }
  return piperLibPromise;
}

export function usePiperTts(): TtsAdapter {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [endedCount, setEndedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [rate, setRate] = useState<PiperTtsRate>(loadRate);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voiceUri, setVoiceUriState] = useState<string | null>(loadVoiceUri);
  const [volume, setVolumeState] = useState<number>(loadVolume);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  // 同期 predict のための識別子 (新 speak でこれが上書きされたら旧 predict 結果は破棄)
  const playTokenRef = useRef(0);
  const rateRef = useSyncedRef(rate);
  const voiceUriRef = useSyncedRef(voiceUri);
  const volumeRef = useSyncedRef(volume);
  const currentTextRef = useRef<string>("");
  const onBoundaryRef = useRef<((charIndex: number) => void) | null>(null);
  const boundaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // 環境サポート判定: `Audio` + `URL.createObjectURL` + OPFS が必要 (OPFS は initial mount でチェック)
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (typeof Audio === "undefined") return false;
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
    // OPFS (StorageManager.getDirectory) はモデル保存先として必須
    const sm = (navigator as { storage?: { getDirectory?: unknown } }).storage;
    if (!sm || typeof sm.getDirectory !== "function") return false;
    return true;
  }, []);

  // voice 一覧を mount 時に取得 (lazy)
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const lib = await loadPiperLib();
        const raw = await lib.voices();
        if (cancelled) return;
        const mapped: TtsVoice[] = [];
        for (const v of raw) {
          const tts = piperVoiceToTtsVoice(v.key);
          if (tts) mapped.push(tts);
        }
        setVoices(mapped);
      } catch (err) {
        if (!cancelled) {
          devError("[usePiperTts] voices() failed", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const clearBoundaryTimer = useCallback(() => {
    if (boundaryTimerRef.current !== null) {
      clearInterval(boundaryTimerRef.current);
      boundaryTimerRef.current = null;
    }
  }, []);

  const releaseAudio = useCallback(() => {
    clearBoundaryTimer();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, [clearBoundaryTimer]);

  const resetState = useCallback(() => {
    releaseAudio();
    audioRef.current = null;
    currentTextRef.current = "";
    onBoundaryRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
  }, [releaseAudio]);

  const stop = useCallback(() => {
    if (!supported) return;
    playTokenRef.current += 1; // 進行中の predict を即無効化
    resetState();
  }, [supported, resetState]);

  const speak = useCallback(
    (text: string, onBoundary?: (charIndex: number) => void) => {
      if (!supported) return;
      currentTextRef.current = text;
      onBoundaryRef.current = onBoundary ?? null;
      const voiceId = extractPiperVoiceId(voiceUriRef.current);
      if (!voiceId) {
        devError("[usePiperTts] no piper voice selected (voiceUri must start with 'piper:')", {
          voiceUri: voiceUriRef.current,
        });
        setErrorCount((c) => c + 1);
        return;
      }
      // 進行中の再生を停止
      releaseAudio();
      audioRef.current = null;
      const token = ++playTokenRef.current;

      (async () => {
        let blob: Blob;
        try {
          const lib = await loadPiperLib();
          blob = await lib.predict({ text, voiceId });
        } catch (err) {
          if (token !== playTokenRef.current) return; // 古い predict、破棄
          devError("[usePiperTts] predict failed", { voiceId, error: err });
          setErrorCount((c) => c + 1);
          return;
        }
        if (token !== playTokenRef.current) return; // 進行中に stop / 別 speak が来た

        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audio.playbackRate = rateRef.current;
        audio.volume = volumeRef.current;
        audioRef.current = audio;

        audio.onplaying = () => {
          if (token !== playTokenRef.current) return;
          setIsPlaying(true);
          setIsPaused(false);
          startTimeRef.current = Date.now();
          // boundary 擬似発火: 経過時間 × 推定 cps × playbackRate で charIndex を更新
          clearBoundaryTimer();
          if (onBoundaryRef.current) {
            boundaryTimerRef.current = setInterval(() => {
              const cb = onBoundaryRef.current;
              if (!cb) return;
              const elapsedMs = Date.now() - startTimeRef.current;
              const charIndex = Math.floor((elapsedMs * ESTIMATED_CPS * rateRef.current) / 1000);
              const clamped = Math.min(charIndex, currentTextRef.current.length);
              cb(clamped);
            }, BOUNDARY_TICK_MS);
          }
        };
        audio.onpause = () => {
          if (token !== playTokenRef.current) return;
          // ended の前に発火することがあるため `audio.ended` で区別
          if (!audio.ended) setIsPaused(true);
        };
        audio.onended = () => {
          if (token !== playTokenRef.current) return;
          setEndedCount((c) => c + 1);
          resetState();
        };
        audio.onerror = () => {
          if (token !== playTokenRef.current) return;
          devError("[usePiperTts] audio.onerror", { error: audio.error });
          setErrorCount((c) => c + 1);
          resetState();
        };

        try {
          await audio.play();
        } catch (err) {
          if (token !== playTokenRef.current) return;
          devError("[usePiperTts] audio.play() failed", err);
          setErrorCount((c) => c + 1);
          resetState();
        }
      })();
    },
    [supported, releaseAudio, resetState, clearBoundaryTimer, rateRef, voiceUriRef, volumeRef],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    audio.pause();
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    const audio = audioRef.current;
    if (!audio || !audio.paused) return;
    audio.play().then(
      () => setIsPaused(false),
      (err) => {
        devError("[usePiperTts] resume play() failed", err);
        setErrorCount((c) => c + 1);
      },
    );
  }, [supported]);

  const cycleRate = useCallback((): number => {
    const next = cycleValue(PIPER_TTS_RATES, rateRef.current);
    storageSet(STORAGE_KEYS.TTS_RATE, String(next));
    rateRef.current = next;
    setRate(next);
    // 再生中なら即反映 (Web Speech と違い、playbackRate は途中変更可能)
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = next;
      // boundary 推定の基準時刻も更新 (簡易: cycleRate 時点で startTime をリセット)
      startTimeRef.current = Date.now();
    }
    return next;
  }, [rateRef]);

  const setVoiceUri = useCallback(
    (uri: string | null) => {
      storageSet(STORAGE_KEYS.TTS_VOICE_URI, uri ?? "");
      voiceUriRef.current = uri;
      setVoiceUriState(uri);
      const text = currentTextRef.current;
      if (text) speak(text, onBoundaryRef.current ?? undefined);
    },
    [speak, voiceUriRef],
  );

  const setVolume = useCallback(
    (v: number) => {
      const clamped = clampTtsVolume(v);
      storageSet(STORAGE_KEYS.TTS_VOLUME, String(clamped));
      volumeRef.current = clamped;
      setVolumeState(clamped);
      const audio = audioRef.current;
      if (audio) audio.volume = clamped;
    },
    [volumeRef],
  );

  // アンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      playTokenRef.current += 1;
      releaseAudio();
    };
  }, [releaseAudio]);

  return {
    engine: "piper",
    supported,
    isPlaying,
    isPaused,
    endedCount,
    errorCount,
    rate,
    cycleRate,
    volume,
    setVolume,
    voices,
    voiceUri,
    setVoiceUri,
    speak,
    pause,
    resume,
    stop,
  };
}
