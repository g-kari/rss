"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TtsAdapter } from "../lib/tts-adapter";

/**
 * TTS engine adapter を React tree に注入する Context (#675 Phase 1b)。
 *
 * App.tsx で `useSpeechSynthesis()` を 1 回だけ呼び、その戻り値を Provider に渡す。
 * 配下の consumer (記事ヘッダー TTS ボタン / UserSettingsModal の voice 選択) は
 * `useTtsAdapter()` で同じ adapter インスタンスを受け取る。
 *
 * これにより:
 *  - voice 選択 UI を記事ヘッダーから設定モーダルに移動可能
 *  - 同一 isPlaying / rate / voice state が全 consumer で共有される
 *  - Phase 2 (#674 Piper wasm) で `usePiperTts()` に差し替えるとき、Provider の中身を
 *    切り替えるだけで全 consumer が自動追従する
 */
const TtsAdapterContext = createContext<TtsAdapter | null>(null);

export function TtsAdapterProvider({
  value,
  children,
}: {
  value: TtsAdapter;
  children: ReactNode;
}) {
  return <TtsAdapterContext value={value}>{children}</TtsAdapterContext>;
}

/**
 * 配下のコンポーネントから TTS adapter にアクセスする hook。
 * Provider 配下でない場合はエラーを throw (バグの早期発見)。
 */
export function useTtsAdapter(): TtsAdapter {
  const ctx = useContext(TtsAdapterContext);
  if (!ctx) throw new Error("useTtsAdapter must be used within TtsAdapterProvider");
  return ctx;
}
