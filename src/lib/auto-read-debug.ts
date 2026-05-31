/**
 * AutoReadController の診断ログヘルパー (#678)。
 *
 * 本番環境でユーザーがオートモードの不具合を再現する際に、`localStorage` に
 * `rss-debug-autoread = "1"` をセットしている場合のみ console.info で詳細ログを
 * 出力する。デフォルト OFF なので一般ユーザーの DevTools を汚さない。
 *
 * 使い方 (ユーザー側):
 *   localStorage.setItem("rss-debug-autoread", "1") → リロード → 操作再現 → DevTools の Console を確認
 *   localStorage.removeItem("rss-debug-autoread") で OFF
 *
 * 実装は `debug-helper.ts` の `createDebugHelper` factory に集約済。本 file は `bgaudio-debug.ts`
 * と同 pattern の thin wrapper で、e2e spec の import 互換性 (`evaluateAutoReadDebugEnabled` 等の export 名) を維持する。
 */

import { createDebugHelper, evaluateDebugEnabled } from "./debug-helper";

const helper = createDebugHelper("rss-debug-autoread", "[AutoRead]");

/** 純粋判定: storage の値から enabled かを判定 (テスタビリティのため分離)。 */
export const evaluateAutoReadDebugEnabled = evaluateDebugEnabled;

/**
 * 診断ログを出力する。`rss-debug-autoread = "1"` のときだけ console.info に
 * `[AutoRead]` prefix 付きでデータを出す。
 */
export const autoReadDebug = helper.log;
