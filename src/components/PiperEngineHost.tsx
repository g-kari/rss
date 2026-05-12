"use client";

import type { ReactNode } from "react";
import { usePiperTts } from "../hooks/usePiperTts";
import type { TtsAdapter } from "../lib/tts-adapter";

/**
 * Piper wasm TTS engine の hook host (#674 Phase 2c / closes #753)。
 *
 * `next/dynamic({ ssr: false })` で App.tsx から動的 import される前提の薄い render prop
 * コンポーネント。`usePiperTts({ enabled })` を内部で呼んで生成した `TtsAdapter` を
 * children callback に渡して expose する。
 *
 * Why dynamic import:
 *   `@mintplex-labs/piper-tts-web` 内部 chunk `piper-XXXX.js` は Emscripten 由来で
 *   Node.js fallback `require("fs")` を含む。Next.js 16 default Turbopack が静的解析で
 *   これを解決しようとして build を壊すため、本ファイルを `ssr: false` 下の dynamic chunk
 *   に隔離して client bundle 限定にする。
 *
 * Why render prop (構造案 2):
 *   React Rules of Hooks により `usePiperTts` は React component 内でしか呼べない。
 *   App.tsx の他 hook と独立にこの hook を mount しつつ、その戻り値を App 配下に提供する
 *   ために render prop pattern (children: (adapter) => ReactNode) を採用。
 *
 * 配置:
 *   App.tsx (= AppShell.tsx) を本 component の render prop callback 内で render することで
 *   piperAdapter を AppShell に注入する。
 */
interface Props {
  /**
   * false の間は usePiperTts 側の `enabled` プロパティに転送され、wasm load / voices fetch /
   * speak が全て skip される (リソース節約)。App.tsx で engine === "piper" のときだけ true を渡す。
   */
  enabled: boolean;
  children: (adapter: TtsAdapter) => ReactNode;
}

export default function PiperEngineHost({ enabled, children }: Props): ReactNode {
  const adapter = usePiperTts({ enabled });
  return children(adapter);
}
