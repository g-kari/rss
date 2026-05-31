/**
 * Summarizer / Translator 等の Chrome 組み込みブラウザ AI 共通ユーティリティ。
 *
 * `browser-summarizer.ts` / `browser-translator.ts` から共有シンボルを集約したモジュール。
 * 新規ブラウザ AI API を追加する際もここに汎用判定ロジックを追記する。
 */

/** Summarizer / Translator 共通の availability 型。 */
export type BrowserAiAvailability = "available" | "downloadable" | "downloading" | "unavailable";

/**
 * 判定された availability に基づいてブラウザ AI (Summarizer / Translator) を
 * 使用できるかを返す共通ヘルパー。
 * - `available`: 即時利用可能
 * - `downloadable`: モデル未 DL だが create() が自動 DL するため利用可
 */
export function shouldUseBrowserAi(availability: BrowserAiAvailability): boolean {
  return availability === "available" || availability === "downloadable";
}

/** UA 文字列から Chrome のメジャーバージョンを抽出する純粋関数。Edge 等の Chromium ベースも対象。 */
export function parseChromeMajorVersion(userAgent: string): number | null {
  const match = /Chrome\/(\d+)/.exec(userAgent);
  return match ? parseInt(match[1], 10) : null;
}
