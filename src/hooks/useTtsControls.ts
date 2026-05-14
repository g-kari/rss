"use client";

import { type MutableRefObject, useCallback, useState } from "react";
import { cycleValue } from "../lib/article-utils";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { clampTtsVolume, parseTtsVolume } from "../lib/tts-volume";
import { useSyncedRef } from "./useSyncedRef";

export interface UseTtsControlsOptions<R extends number> {
  rates: readonly R[];
  defaultRate: R;
  /** 呼び出し側が rate 変化時に実行したい副作用 (例: speak 再起動)。不要なら省略 */
  onRateChange?: () => void;
  /** 呼び出し側が voiceUri 変化時に実行したい副作用。不要なら省略 */
  onVoiceChange?: () => void;
  /** 呼び出し側が volume 変化時に実行したい副作用。不要なら省略 */
  onVolumeChange?: () => void;
}

export interface UseTtsControlsReturn<R extends number> {
  rate: R;
  /** 速度配列を循環して次の速度に切り替え、新しい速度値を返す */
  cycleRate: () => number;
  voiceUri: string | null;
  setVoiceUri: (uri: string | null) => void;
  /**
   * voiceUri を silent に set (onVoiceChange callback を skip)。
   * 内部 error handler の自動 reset 等、user 操作ではない経路で使用。
   */
  setVoiceUriSilent: (uri: string | null) => void;
  volume: number;
  setVolume: (v: number) => void;
  /** stale closure 回避用 ref — useCallback deps には入れないこと (useSyncedRef 規範) */
  rateRef: MutableRefObject<R>;
  voiceUriRef: MutableRefObject<string | null>;
  volumeRef: MutableRefObject<number>;
}

/**
 * TTS engine 共通の rate / voiceUri / volume 制御 hook。
 * useSpeechSynthesis / usePiperTts の重複コードを集約する。
 *
 * - 各値は localStorage に永続化され、マウント時に復元される
 * - 変化時の副作用 (例: speak 再起動) は onXxxChange option で DI する
 * - 戻り値の xxxRef は stale closure 回避用。deps 配列には入れないこと
 */
export function useTtsControls<R extends number>(
  options: UseTtsControlsOptions<R>,
): UseTtsControlsReturn<R> {
  const { rates, defaultRate, onRateChange, onVoiceChange, onVolumeChange } = options;

  const [rate, setRate] = useState<R>(() => {
    const stored = storageGet(STORAGE_KEYS.TTS_RATE);
    const parsed = stored ? (parseFloat(stored) as R) : null;
    return (rates as readonly number[]).includes(parsed as number) ? (parsed as R) : defaultRate;
  });

  const [voiceUri, setVoiceUriState] = useState<string | null>(() => {
    return storageGet(STORAGE_KEYS.TTS_VOICE_URI) || null;
  });

  const [volume, setVolumeState] = useState<number>(() => {
    return parseTtsVolume(storageGet(STORAGE_KEYS.TTS_VOLUME));
  });

  const rateRef = useSyncedRef(rate);
  const voiceUriRef = useSyncedRef(voiceUri);
  const volumeRef = useSyncedRef(volume);
  const onRateChangeRef = useSyncedRef(onRateChange);
  const onVoiceChangeRef = useSyncedRef(onVoiceChange);
  const onVolumeChangeRef = useSyncedRef(onVolumeChange);

  const cycleRate = useCallback((): number => {
    const next = cycleValue(rates, rateRef.current);
    storageSet(STORAGE_KEYS.TTS_RATE, String(next));
    rateRef.current = next;
    setRate(next);
    onRateChangeRef.current?.();
    return next;
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const setVoiceUri = useCallback(
    (uri: string | null) => {
      storageSet(STORAGE_KEYS.TTS_VOICE_URI, uri ?? "");
      voiceUriRef.current = uri;
      setVoiceUriState(uri);
      onVoiceChangeRef.current?.();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setVoiceUriSilent = useCallback(
    (uri: string | null) => {
      storageSet(STORAGE_KEYS.TTS_VOICE_URI, uri ?? "");
      voiceUriRef.current = uri;
      setVoiceUriState(uri);
      // onVoiceChange は呼ばない (silent)
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setVolume = useCallback(
    (v: number) => {
      const clamped = clampTtsVolume(v);
      storageSet(STORAGE_KEYS.TTS_VOLUME, String(clamped));
      volumeRef.current = clamped;
      setVolumeState(clamped);
      onVolumeChangeRef.current?.();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
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
  };
}
