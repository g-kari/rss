/**
 * useBackgroundAudio (バックグラウンド TTS 継続用無音 oscillator) の診断ログヘルパー (#745 Phase C 案 B)。
 *
 * バックグラウンド TTS 継続が「効かない」報告 (iOS Safari ロックスクリーンで停止 / Android Chrome で
 * 突如停止 等) の真因切り分け用。`localStorage` に `rss-debug-bgaudio = "1"` をセットしている場合のみ
 * `console.info` で AudioContext / Oscillator のライフサイクル詳細を出力する。デフォルト OFF なので
 * 一般ユーザーの DevTools を汚さない。`auto-read-debug.ts` と同パターン。
 *
 * 使い方 (ユーザー側):
 *   localStorage.setItem("rss-debug-bgaudio", "1") → リロード → TTS 再生 → スマホで background へ
 *   DevTools (リモート debug) の Console を確認 → 結果を Issue にペースト
 *   localStorage.removeItem("rss-debug-bgaudio") で OFF
 *
 * 実装は `debug-helper.ts` の `createDebugHelper` factory に集約済。本 file は thin wrapper で、
 * e2e spec の import 互換性 (`evaluateBgAudioDebugEnabled` 等の export 名) を維持する。
 */

import { createDebugHelper, evaluateDebugEnabled } from "./debug-helper";

const helper = createDebugHelper("rss-debug-bgaudio", "[BgAudio]");

/** 純粋判定: storage の値から enabled かを判定 (テスタビリティのため分離)。 */
export const evaluateBgAudioDebugEnabled = evaluateDebugEnabled;

/**
 * 診断ログを出力する。`rss-debug-bgaudio = "1"` のときだけ console.info に
 * `[BgAudio]` prefix 付きでデータを出す。
 */
export const bgAudioDebug = helper.log;

/** デバッグモードが有効かどうかを返す (3 関数セットの設定取得枠 #953)。 */
export const isBgAudioDebugEnabled = helper.isEnabled;
