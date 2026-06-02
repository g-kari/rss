/**
 * usePiperTts (Piper wasm TTS engine) の診断ログヘルパー (#1055)。
 *
 * Piper engine の library load / PiperPlus.initialize の段階を可視化する本番デバッグ用 (#761)。
 * `localStorage` に `rss-debug-piper = "1"` をセットしている場合のみ `console.info` で
 * voice / model の初期化ライフサイクル詳細を出力する。デフォルト OFF なので一般ユーザーの
 * DevTools を汚さない。`auto-read-debug.ts` / `bgaudio-debug.ts` と同パターン。
 *
 * 使い方 (ユーザー側):
 *   localStorage.setItem("rss-debug-piper", "1") → リロード → Piper engine で TTS 再生
 *   DevTools の Console を確認 → 結果を Issue にペースト
 *   localStorage.removeItem("rss-debug-piper") で OFF
 *
 * 実装は `debug-helper.ts` の `createDebugHelper` factory に集約済。本 file は thin wrapper。
 */

import { createDebugHelper, evaluateDebugEnabled } from "./debug-helper";

const helper = createDebugHelper("rss-debug-piper", "[Piper]");

/** 純粋判定: storage の値から enabled かを判定 (テスタビリティのため分離)。 */
export const evaluatePiperDebugEnabled = evaluateDebugEnabled;
/**
 * 診断ログを出力する。`rss-debug-piper = "1"` のときだけ console.info に
 * `[Piper]` prefix 付きでデータを出す。
 */
export const piperDebug = helper.log;
