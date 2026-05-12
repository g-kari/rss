import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import { cycleValue } from "../lib/article-utils";
import {
  PIPER_PLUS_VOICES,
  DEFAULT_SPEAKER_EMBEDDING_DIM,
  findPiperPlusVoice,
  piperPlusVoiceToTtsVoice,
  type PiperPlusVoice,
} from "../lib/piper-voices";
import type { TtsAdapter, TtsErrorCode, TtsVoice } from "../lib/tts-adapter";
import { clampTtsVolume, parseTtsVolume } from "../lib/tts-volume";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";

/**
 * Piper TTS wasm engine (`piper-plus` library) を用いた読み上げ管理 hook (#761)。
 *
 * `TtsAdapter` interface を実装し、`useSpeechSynthesis` と同じ契約を満たす。
 *
 * piper-plus API:
 *   - `PiperPlus.initialize({ model, ort, wasmG2pUrl, onProgress })` — model は HF / shortcut / URL
 *   - `tts.synthesize(text, { language, lengthScale, ... })` → `AudioResult`
 *   - `AudioResult.play()` で再生 (内部で AudioContext + BufferSource)
 *   - `tts.dispose()` で resource 解放
 *
 * 設計:
 *   - voice 切替時に instance recreate (model DL コストあり、ただし同 voice の再 speak は再利用)
 *   - boundary 通知は piper-plus に native API なし → setInterval で経過時間 × 推定 cps で擬似発火
 *   - WASM / model は R2 経由 (`/api/wasm/piper_plus_wasm.js` / `/api/piper-voice/<id>.onnx`)
 */
export const PIPER_TTS_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0] as const;
export type PiperTtsRate = (typeof PIPER_TTS_RATES)[number];

const ESTIMATED_CPS = 12;
const BOUNDARY_TICK_MS = 100;

const PIPER_WASM_LOADER_URL = "/api/wasm/piper_plus_wasm.js";

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

interface PiperPlusAudioResult {
  play: () => Promise<void>;
  duration: number;
  sampleRate: number;
  samples: Float32Array;
}

interface PiperPlusInstance {
  synthesize: (
    text: string,
    options?: { language?: string; lengthScale?: number },
  ) => Promise<PiperPlusAudioResult>;
  /**
   * Multi-speaker / voice-cloning model 向け合成 API。speaker embedding (Float32Array) を
   * 渡して ONNX model の `speaker_embedding` input tensor を埋める。
   * zero-filled embedding を渡すと default speaker 0 の voice が合成される。
   */
  synthesizeWithVoiceCloning: (
    text: string,
    speakerEmbedding: Float32Array,
    options?: { language?: string; lengthScale?: number },
  ) => Promise<PiperPlusAudioResult>;
  dispose: () => void;
}

interface PiperPlusLib {
  initialize: (options: {
    model: string;
    ort: unknown;
    wasmG2pUrl?: string;
    zhDictBaseUrl?: string;
    onProgress?: (info: { stage: string; progress: number; message: string }) => void;
  }) => Promise<PiperPlusInstance>;
}

/** dynamic import で library + onnxruntime-web を 1 回だけ読み込む (singleton) */
let piperLibPromise: Promise<{ lib: PiperPlusLib; ort: unknown }> | null = null;
function loadPiperLib(): Promise<{ lib: PiperPlusLib; ort: unknown }> {
  if (!piperLibPromise) {
    piperLibPromise = (async () => {
      const ort = await import("onnxruntime-web");
      if (typeof window !== "undefined") {
        // onnxruntime-web の wasm も同 R2 prefix 配下 (`/api/wasm/`) から fetch
        ort.env.wasm.wasmPaths = "/api/wasm/";
      }
      const mod = (await import("piper-plus")) as unknown as { PiperPlus: PiperPlusLib };
      return { lib: mod.PiperPlus, ort };
    })();
  }
  return piperLibPromise;
}

export interface UsePiperTtsOptions {
  enabled?: boolean;
}

export function usePiperTts(options?: UsePiperTtsOptions): TtsAdapter {
  const enabled = options?.enabled ?? true;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [endedCount, setEndedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lastError, setLastError] = useState<TtsErrorCode | null>(null);
  const [lastErrorDetail, setLastErrorDetail] = useState<TtsAdapter["lastErrorDetail"]>(null);
  const [rate, setRate] = useState<PiperTtsRate>(loadRate);
  const [voiceUri, setVoiceUriState] = useState<string | null>(loadVoiceUri);
  const [volume, setVolumeState] = useState<number>(loadVolume);
  // engine 初期化中の進捗 (null = 初期化していない / 完了済)。
  // PiperPlus.initialize の onProgress callback で更新、UI 側で floating progress toast に表示。
  const [initProgress, setInitProgress] = useState<{
    stage: string;
    progress: number;
    message: string;
  } | null>(null);

  const ttsInstanceRef = useRef<PiperPlusInstance | null>(null);
  const ttsVoiceIdRef = useRef<string | null>(null);
  const playTokenRef = useRef(0);
  const rateRef = useSyncedRef(rate);
  const voiceUriRef = useSyncedRef(voiceUri);
  const volumeRef = useSyncedRef(volume);
  const currentTextRef = useRef<string>("");
  const onBoundaryRef = useRef<((charIndex: number) => void) | null>(null);
  const boundaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // voice 一覧は static (PIPER_PLUS_VOICES から導出)
  const voices = useMemo<TtsVoice[]>(() => PIPER_PLUS_VOICES.map(piperPlusVoiceToTtsVoice), []);

  // 環境サポート判定
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (typeof AudioContext === "undefined" && typeof window.AudioContext === "undefined") {
      return false;
    }
    return true;
  }, []);

  const clearBoundaryTimer = useCallback(() => {
    if (boundaryTimerRef.current !== null) {
      clearInterval(boundaryTimerRef.current);
      boundaryTimerRef.current = null;
    }
  }, []);

  const resetPlaybackState = useCallback(() => {
    clearBoundaryTimer();
    currentTextRef.current = "";
    onBoundaryRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
  }, [clearBoundaryTimer]);

  const ensureInstance = useCallback(async (voice: PiperPlusVoice): Promise<PiperPlusInstance> => {
    if (ttsInstanceRef.current && ttsVoiceIdRef.current === voice.id) {
      return ttsInstanceRef.current;
    }
    // voice 変更時は旧 instance を dispose
    if (ttsInstanceRef.current) {
      try {
        ttsInstanceRef.current.dispose();
      } catch {
        /* silent */
      }
      ttsInstanceRef.current = null;
      ttsVoiceIdRef.current = null;
    }
    // 本番デバッグ用ログ (#761): library load / initialize の段階を可視化
    console.info(`[usePiperTts] initializing voice=${voice.id} model=${voice.model}`);
    const { lib, ort } = await loadPiperLib();
    console.info(`[usePiperTts] library loaded, calling PiperPlus.initialize`);
    // 初期化開始時に progress を初期状態に
    setInitProgress({ stage: "starting", progress: 0, message: "初期化を開始しています..." });
    const instance = await lib.initialize({
      // HuggingFace repo 名 (`ayousanz/piper-plus-tsukuyomi-chan`) は library 内部で
      // huggingface.co/<repo>/resolve/main/ から自動 resolve される (standard path)。
      model: voice.model,
      ort,
      onProgress: (info) => {
        setInitProgress({
          stage: info.stage,
          progress: info.progress,
          message: info.message,
        });
      },
      // patched piper-plus (patches/piper-plus.patch) で `new Function` 経由に書き換え済の
      // `import(url)` 経路を通すため wasmG2pUrl で URL を渡す。同 URL は wasm-bindgen の
      // `__wbg_init` が `new URL(bg.wasm, import.meta.url)` で相対解決するため、絶対 URL
      // (= window.location.origin + path) に変換しておく必要がある。
      wasmG2pUrl: new URL(PIPER_WASM_LOADER_URL, window.location.origin).toString(),
      // piper-plus は Chinese pinyin dict を `new URL('../../assets/', import.meta.url)`
      // の default で fetch しようとするが、bundle 環境ではこれが build 時の `file:///ROOT/...`
      // 絶対 path に解決されて CSP 違反 + fetch 失敗になる。同 URL は npm package に含まれず
      // 元から存在しないため、same-origin の `/api/wasm/` を渡して 404 graceful degrade させる
      // (piper-plus は `pinyin_single.json` 取得失敗時に "zh will use passthrough" で続行)。
      zhDictBaseUrl: new URL("/api/wasm/", window.location.origin).toString(),
    });
    console.info(`[usePiperTts] PiperPlus.initialize complete for voice=${voice.id}`);
    ttsInstanceRef.current = instance;
    ttsVoiceIdRef.current = voice.id;
    // 初期化完了で progress を non-null のまま「完了」表示にして自動で消える
    // (UI 側で 1 秒程度の "完了!" 表示後 fade out する設計)
    setInitProgress({ stage: "complete", progress: 1, message: "準備完了" });
    setTimeout(() => setInitProgress(null), 1500);
    return instance;
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    playTokenRef.current += 1;
    resetPlaybackState();
  }, [supported, resetPlaybackState]);

  const speak = useCallback(
    (text: string, onBoundary?: (charIndex: number) => void) => {
      if (!supported) return;
      if (!enabled) return;
      const voice = findPiperPlusVoice(voiceUriRef.current);
      if (!voice) {
        devError("[usePiperTts] no piper-plus voice selected", {
          voiceUri: voiceUriRef.current,
        });
        setLastError("voice-unavailable");
        setLastErrorDetail({
          code: "voice-unavailable",
          message: `Piper voice "${voiceUriRef.current ?? "(null)"}" が PIPER_PLUS_VOICES に見つかりませんでした`,
          voiceUri: voiceUriRef.current,
          engine: "piper",
          occurredAt: new Date().toISOString(),
        });
        setErrorCount((c) => c + 1);
        return;
      }
      currentTextRef.current = text;
      onBoundaryRef.current = onBoundary ?? null;
      const token = ++playTokenRef.current;

      (async () => {
        let audio: PiperPlusAudioResult;
        try {
          const instance = await ensureInstance(voice);
          if (token !== playTokenRef.current) return;
          const synthOptions = {
            language: voice.synthesisLanguage,
            lengthScale: 1 / rateRef.current, // 速度逆数 (rate=2 → lengthScale=0.5 で 2 倍速)
          };
          if (voice.requiresSpeakerEmbedding) {
            // Multi-speaker / WavLM Prosody base 派生 model は ONNX graph に `speaker_embedding` input
            // tensor を要求する。zero-filled Float32Array(256) を渡すと default speaker 0 の voice が
            // 合成される (tsukuyomi-chan 等)。voice cloning ではなく default voice 利用が目的。
            const dim = voice.speakerEmbeddingDim ?? DEFAULT_SPEAKER_EMBEDDING_DIM;
            audio = await instance.synthesizeWithVoiceCloning(
              text,
              new Float32Array(dim),
              synthOptions,
            );
          } else {
            audio = await instance.synthesize(text, synthOptions);
          }
        } catch (err) {
          if (token !== playTokenRef.current) return;
          // 本番環境でも詳細を出すため console.error 直接使用 (#761 デバッグ強化)
          // err.message / err.stack / err.name すべて確実に出して原因特定を可能にする
          const errMsg = err instanceof Error ? err.message : String(err);
          const errName = err instanceof Error ? err.name : "";
          const errStack = err instanceof Error ? err.stack : "";
          console.error(
            `[usePiperTts] synthesize failed voiceId=${voice.id} model=${voice.model}`,
            { name: errName, message: errMsg, stack: errStack, raw: err },
          );
          devError("[usePiperTts] synthesize failed", { voiceId: voice.id, error: err });
          const lower = errMsg.toLowerCase();
          const code: TtsErrorCode =
            lower.includes("fetch") || lower.includes("network") ? "network" : "model-error";
          setLastError(code);
          setLastErrorDetail({
            code,
            message: errMsg,
            name: errName || undefined,
            voiceUri: `piper:${voice.id}`,
            model: voice.model,
            engine: "piper",
            occurredAt: new Date().toISOString(),
          });
          setErrorCount((c) => c + 1);
          // 失敗時も progress を消去 (toast / banner で error 通知に切り替わる前提)
          setInitProgress(null);
          return;
        }
        if (token !== playTokenRef.current) return;

        setIsPlaying(true);
        setIsPaused(false);
        startTimeRef.current = Date.now();
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

        try {
          await audio.play();
        } catch (err) {
          if (token !== playTokenRef.current) return;
          devError("[usePiperTts] audio.play() failed", err);
          const name = err instanceof Error ? err.name : "";
          const message = err instanceof Error ? err.message : String(err);
          const code: TtsErrorCode =
            name === "NotAllowedError" ? "not-allowed" : "synthesis-failed";
          setLastError(code);
          setLastErrorDetail({
            code,
            message,
            name: name || undefined,
            voiceUri: `piper:${voice.id}`,
            model: voice.model,
            engine: "piper",
            occurredAt: new Date().toISOString(),
          });
          setErrorCount((c) => c + 1);
          resetPlaybackState();
          return;
        }
        if (token !== playTokenRef.current) return;
        // play() resolve = 再生終了 (piper-plus 仕様)
        setEndedCount((c) => c + 1);
        resetPlaybackState();
      })();
    },
    [
      supported,
      enabled,
      voiceUriRef,
      rateRef,
      ensureInstance,
      clearBoundaryTimer,
      resetPlaybackState,
    ],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    // piper-plus AudioResult.play() 中の pause API は library に無いため non-op
    // (将来 streaming synthesis + AudioContext.suspend で実装余地あり)
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    // 同上 — pause 対応待ち
  }, [supported]);

  const cycleRate = useCallback((): number => {
    const next = cycleValue(PIPER_TTS_RATES, rateRef.current);
    storageSet(STORAGE_KEYS.TTS_RATE, String(next));
    rateRef.current = next;
    setRate(next);
    // piper-plus は再生中の rate 変更不可 (synthesize 時の lengthScale で固定) → 次 speak で反映
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
      // piper-plus AudioResult は volume control API なし (将来 AudioContext.GainNode 経由で実装余地)
    },
    [volumeRef],
  );

  // アンマウント時に instance dispose
  useEffect(() => {
    return () => {
      playTokenRef.current += 1;
      clearBoundaryTimer();
      if (ttsInstanceRef.current) {
        try {
          ttsInstanceRef.current.dispose();
        } catch {
          /* silent */
        }
        ttsInstanceRef.current = null;
        ttsVoiceIdRef.current = null;
      }
    };
  }, [clearBoundaryTimer]);

  return {
    engine: "piper",
    supported,
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
    voices,
    voiceUri,
    setVoiceUri,
    speak,
    pause,
    resume,
    stop,
    initProgress,
  };
}
