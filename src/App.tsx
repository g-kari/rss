"use client";

import dynamic from "next/dynamic";
import AppShell from "./components/AppShell";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { useTtsEngineSetting } from "./hooks/useTtsEngineSetting";
import type { TtsAdapter } from "./lib/tts-adapter";

/**
 * Piper wasm engine の hook host を `next/dynamic({ ssr: false })` で隔離する (#674 Phase 2c /
 * closes #753)。`@mintplex-labs/piper-tts-web` 内部 chunk は Emscripten 由来の `require("fs")`
 * を含み、Next.js 16 default の Turbopack 静的解析を壊すため、本 dynamic import で client bundle
 * 限定 + ssr 時 skip にする。
 *
 * 構造案 2 + render prop (ユーザー採用案 — Issue #753 2026-05-12T07:02:45Z 判断):
 *   - PiperEngineHost は常時 mount (children render prop で adapter を expose)
 *   - `enabled={engine === "piper"}` を渡し、Web Speech 選択中は usePiperTts 側で wasm load /
 *     voices fetch / speak を完全 skip (リソース節約)
 *   - AppShell 側で engine 設定値に応じて piperAdapter / speechSynAdapter を切替
 *   - engine 切替時の中断は AppShell の useEffect で adapter.stop() を呼んで実現
 */
const PiperEngineHost = dynamic(() => import("./components/PiperEngineHost"), { ssr: false });

export default function App() {
  // useTtsEngineSetting / useSpeechSynthesis は React Rules of Hooks により React component
  // 内でしか呼べないため、render prop callback で AppShell を render する構造にして、それぞれの
  // 戻り値を props で AppShell に注入する。
  const { engine, setEngine } = useTtsEngineSetting();
  const speechSynAdapter = useSpeechSynthesis();
  return (
    <PiperEngineHost enabled={engine === "piper"}>
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
