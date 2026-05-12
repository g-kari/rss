import { useState, useCallback, useEffect } from "react";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import type { TtsEngineId } from "../lib/tts-adapter";

const VALID_ENGINES: readonly TtsEngineId[] = ["web-speech", "piper"];

function isValidEngine(v: string | null | undefined): v is TtsEngineId {
  return v !== null && v !== undefined && (VALID_ENGINES as readonly string[]).includes(v);
}

function loadEngine(): TtsEngineId {
  const v = storageGet(STORAGE_KEYS.TTS_ENGINE);
  return isValidEngine(v) ? v : "web-speech";
}

/**
 * TTS engine 設定値の localStorage 永続化 hook (#674 Phase 2b)。
 *
 * App.tsx で 1 度だけ呼び、`useSpeechSynthesis` / `usePiperTts({ enabled })` の選択と
 * `TtsAdapter.setEngine` 注入に使う。別タブ / 別箇所での設定変更は `storage` event で同期する
 * (同タブ内では本 hook の setEngine 経由でのみ更新するので、複数呼出の state 分裂は防止できない —
 *  AppProviders で 1 箇所だけ呼ぶことを caller の責務とする)。
 */
export function useTtsEngineSetting(): {
  engine: TtsEngineId;
  setEngine: (engine: TtsEngineId) => void;
} {
  const [engine, setEngineState] = useState<TtsEngineId>(loadEngine);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.TTS_ENGINE && isValidEngine(e.newValue)) {
        setEngineState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEngine = useCallback((next: TtsEngineId) => {
    storageSet(STORAGE_KEYS.TTS_ENGINE, next);
    setEngineState(next);
  }, []);

  return { engine, setEngine };
}
