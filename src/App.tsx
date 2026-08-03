"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import AppShell from "./components/AppShell";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { useTtsEngineSetting } from "./hooks/useTtsEngineSetting";
import { createDummyPiperAdapter, type TtsAdapter } from "./lib/tts-adapter";

/**
 * Piper wasm engine の hook host を `next/dynamic({ ssr: false })` で隔離する (#674 Phase 2c /
 * closes #753)。`piper-plus` 内部 chunk は Emscripten 由来の `require("fs")` を含み、
 * Next.js 16 default の Turbopack 静的解析を壊すため、本 dynamic import で client bundle
 * 限定 + ssr 時 skip にする。
 *
 * 遅延 mount 化 (初期表示 10 秒問題対応):
 *   - `engine === "piper"` のときのみ PiperEngineHost を mount して piper-plus wasm chunk
 *     (Emscripten runtime 数 MB) を dynamic import 発火 → download 開始
 *   - Web Speech default user は PiperEngineHost 未 mount で wasm chunk が client bundle
 *     から完全に除外され、初期表示に本 chunk の download / parse cost が乗らない
 *   - engine 切替 (web-speech → piper) 時に初回 mount で wasm load lag が発生する
 *     trade-off (ユーザー明示操作なので許容)
 *   - 非 mount 時は AppShell に `createDummyPiperAdapter()` の no-op adapter を渡す
 */
const PiperEngineHost = dynamic(() => import("./components/PiperEngineHost"), { ssr: false });

export default function App() {
  // useTtsEngineSetting / useSpeechSynthesis は React Rules of Hooks により React component
  // 内でしか呼べないため、render prop callback で AppShell を render する構造にして、それぞれの
  // 戻り値を props で AppShell に注入する。
  const { engine, setEngine } = useTtsEngineSetting();
  const speechSynAdapter = useSpeechSynthesis();

  // engine === "piper" のときだけ PiperEngineHost を mount して wasm chunk の dynamic import
  // を発火させる。Web Speech default 時は dummy adapter で AppShell を直接 render し、
  // piper-plus chunk を初期表示から完全に除外する。
  if (engine === "piper") {
    return (
      <PiperEngineHost enabled={true}>
        {(piperAdapter: TtsAdapter) => (
          <AppShell
            engine={engine}
            setEngine={setEngine}
            speechSynAdapter={speechSynAdapter}
            piperAdapter={piperAdapter}
          />
        )}
      </PiperEngineHost>
    );
  }

  return (
    <AppShellWithDummyPiper
      engine={engine}
      setEngine={setEngine}
      speechSynAdapter={speechSynAdapter}
    />
  );
}

/**
 * engine !== "piper" 時の AppShell 呼出 wrapper。`createDummyPiperAdapter()` を useMemo で
 * mount 時 1 回だけ生成して piperAdapter identity を安定化 (AppShell の useSyncedRef /
 * useMemo deps 再評価を engine 切替以外で走らせないため)。
 */
function AppShellWithDummyPiper({
  engine,
  setEngine,
  speechSynAdapter,
}: {
  engine: "web-speech" | "piper";
  setEngine: (engine: "web-speech" | "piper") => void;
  speechSynAdapter: TtsAdapter;
}) {
  const dummyPiperAdapter = useMemo(() => createDummyPiperAdapter(), []);
  return (
    <AppShell
      engine={engine}
      setEngine={setEngine}
      speechSynAdapter={speechSynAdapter}
      piperAdapter={dummyPiperAdapter}
    />
  );
}
