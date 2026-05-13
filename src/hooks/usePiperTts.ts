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
import { splitIntoSentences } from "../lib/tts-sentences";
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

/**
 * module-level singleton AudioContext (#766)。
 * piper-plus の `AudioResult.play()` は内部の AudioBufferSourceNode を外部に expose せず
 * stop() できないため、自前で AudioContext + BufferSource を組み立てて source を ref で保持し、
 * stop 時に確実に再生停止する設計に切替 (案 A)。
 *
 * `useBackgroundAudio` と同じ「component lifetime 中 1 個保持 + suspend/resume 切替」パターン
 * (`react-effect-patterns.md` の「起動コストの重いブラウザ API resource は useRef で lifetime
 * 保持」規範) を踏襲。複数 speak 間で context を共有して OS audio session 切替コストを回避。
 */
let audioContextSingleton: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (audioContextSingleton) return audioContextSingleton;
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioContextSingleton = new Ctx();
  } catch (err) {
    devError("[usePiperTts] AudioContext init failed", err);
    return null;
  }
  return audioContextSingleton;
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
  // 進行中の AudioBufferSourceNode を保持 (#766)。stop() / resetPlaybackState() で
  // source.stop() を呼んで piper-plus 内の再生を確実に停止する。
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

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

  /**
   * 進行中の AudioBufferSourceNode を停止して ref をクリアする (#766)。
   * onended は null に差し替えて natural-end 経路を発火させず、stop による無音化のみを担保する。
   * stop() 後の `source.start()` 再呼出は不可なので必ず使い捨て (next speak で新 source 生成)。
   */
  const releaseAudioSource = useCallback(() => {
    const source = audioSourceRef.current;
    if (!source) return;
    audioSourceRef.current = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* already stopped / not started */
    }
    try {
      source.disconnect();
    } catch {
      /* */
    }
  }, []);

  const resetPlaybackState = useCallback(() => {
    clearBoundaryTimer();
    releaseAudioSource();
    currentTextRef.current = "";
    onBoundaryRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
  }, [clearBoundaryTimer, releaseAudioSource]);

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

      // #767: 長文記事で ONNX SafeInt overflow を回避するため sentence 単位 chunk 化。
      // 空テキスト / 空白のみは silent skip + endedCount 進めて caller の auto-advance を継続。
      const chunks = splitIntoSentences(text);
      if (chunks.length === 0) {
        setEndedCount((c) => c + 1);
        return;
      }

      (async () => {
        setIsPlaying(true);
        setIsPaused(false);
        for (let i = 0; i < chunks.length; i++) {
          if (token !== playTokenRef.current) return;
          const chunk = chunks[i]!;

          let audio: PiperPlusAudioResult;
          try {
            const instance = await ensureInstance(voice);
            if (token !== playTokenRef.current) return;
            const synthOptions = {
              language: voice.synthesisLanguage,
              lengthScale: 1 / rateRef.current,
            };
            if (voice.requiresSpeakerEmbedding) {
              const dim = voice.speakerEmbeddingDim ?? DEFAULT_SPEAKER_EMBEDDING_DIM;
              audio = await instance.synthesizeWithVoiceCloning(
                chunk.text,
                new Float32Array(dim),
                synthOptions,
              );
            } else {
              audio = await instance.synthesize(chunk.text, synthOptions);
            }
          } catch (err) {
            if (token !== playTokenRef.current) return;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errName = err instanceof Error ? err.name : "";
            const errStack = err instanceof Error ? err.stack : "";
            console.error(
              `[usePiperTts] synthesize failed voiceId=${voice.id} model=${voice.model} chunkIndex=${i}/${chunks.length}`,
              { name: errName, message: errMsg, stack: errStack, raw: err },
            );
            devError("[usePiperTts] synthesize failed", {
              voiceId: voice.id,
              chunkIndex: i,
              error: err,
            });
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
            setInitProgress(null);
            resetPlaybackState();
            return;
          }
          if (token !== playTokenRef.current) return;

          // chunk 開始: boundary timer を re-init して累積 offset 込みで全体 charIndex 計算
          startTimeRef.current = Date.now();
          clearBoundaryTimer();
          if (onBoundaryRef.current) {
            const chunkOffset = chunk.start;
            boundaryTimerRef.current = setInterval(() => {
              const cb = onBoundaryRef.current;
              if (!cb) return;
              const elapsedMs = Date.now() - startTimeRef.current;
              const localCharIndex = Math.floor(
                (elapsedMs * ESTIMATED_CPS * rateRef.current) / 1000,
              );
              const globalCharIndex = Math.min(
                chunkOffset + localCharIndex,
                currentTextRef.current.length,
              );
              cb(globalCharIndex);
            }, BOUNDARY_TICK_MS);
          }

          // #766: 自前 AudioContext + BufferSourceNode 再生 (stop 確実化)
          try {
            const ctx = getAudioContext();
            if (!ctx) throw new Error("AudioContext unavailable");
            if (ctx.state === "suspended") {
              try {
                await ctx.resume();
              } catch {
                /* resume failure はそのまま再生 (start 時に NotAllowedError) */
              }
            }
            if (token !== playTokenRef.current) return;
            const buffer = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
            buffer.copyToChannel(new Float32Array(audio.samples), 0);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = volumeRef.current;
            source.connect(gain);
            gain.connect(ctx.destination);
            releaseAudioSource();
            audioSourceRef.current = source;
            await new Promise<void>((resolve, reject) => {
              source.onended = () => {
                if (audioSourceRef.current === source) {
                  audioSourceRef.current = null;
                }
                resolve();
              };
              try {
                source.start();
              } catch (err) {
                reject(err);
              }
            });
          } catch (err) {
            if (token !== playTokenRef.current) return;
            devError("[usePiperTts] audio playback failed", err);
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
          // chunk 完了 → 次 chunk へ (or 全 chunks 完了で loop 抜け)
        }
        if (token !== playTokenRef.current) return;
        // 全 chunks 完了 = 自然 end
        setEndedCount((c) => c + 1);
        resetPlaybackState();
      })();
    },
    [
      supported,
      enabled,
      voiceUriRef,
      rateRef,
      volumeRef,
      ensureInstance,
      clearBoundaryTimer,
      releaseAudioSource,
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

  return useMemo<TtsAdapter>(
    () => ({
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
    }),
    [
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
    ],
  );
}
