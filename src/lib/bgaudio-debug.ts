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
 */

const DEBUG_KEY = "rss-debug-bgaudio";

let cachedEnabled: boolean | null = null;

/** 純粋判定: storage の値から enabled かを判定 (テスタビリティのため分離)。 */
export function evaluateBgAudioDebugEnabled(storedValue: string | null): boolean {
  return storedValue === "1";
}

/**
 * 診断ログが有効かどうか。`localStorage` の `rss-debug-bgaudio` をキャッシュして
 * 高頻度の effect 内呼び出しでも localStorage アクセスを最小化する。
 */
export function isBgAudioDebugEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === "undefined") return false;
  try {
    cachedEnabled = evaluateBgAudioDebugEnabled(window.localStorage.getItem(DEBUG_KEY));
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

/** テスト用 / hot reload 用のキャッシュリセット (通常は呼ばない)。 */
export function resetBgAudioDebugCache(): void {
  cachedEnabled = null;
}

/**
 * 診断ログを出力する。`isBgAudioDebugEnabled()` が true のときだけ console.info に
 * `[BgAudio]` prefix 付きでデータを出す。
 */
export function bgAudioDebug(label: string, data: Record<string, unknown>): void {
  if (!isBgAudioDebugEnabled()) return;
  // eslint-disable-next-line no-console -- 診断ログは本番でも明示的に有効化された時のみ出力
  console.info(`[BgAudio] ${label}`, data);
}
