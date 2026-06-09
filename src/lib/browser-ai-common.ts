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

/** `navigator.userAgent` から Chrome のメジャーバージョンを安全に取得する。SSR 環境では null を返す。 */
function getChromeVersionSafe(): number | null {
  if (typeof navigator === "undefined") return null;
  return parseChromeMajorVersion(navigator.userAgent);
}

/**
 * Summarizer / Translator 等のブラウザ組み込み AI API が stable で利用可能になった
 * 最低 Chrome メジャーバージョン (公式: 138)。
 *
 * 各 API ファイル (`browser-summarizer.ts` / `browser-translator.ts`) は
 * このファイルを canonical 定義として re-export alias を使用する。
 */
export const MIN_BROWSER_AI_CHROME_VERSION = 138;

/**
 * Chromium ベースかつ指定バージョン以上かを判定する共通ヘルパー。
 *
 * `diagnoseSummarizerAvailability` / `diagnoseTranslatorAvailability` の
 * 重複していた 8 行 Chromium 検出ブロックをここに集約。
 * SSR ガード (`typeof navigator !== "undefined"`) も内包する。
 *
 * @returns
 * - `{ compatible: true }` — Chromium + minVersion 以上。呼び出し元は次の判定へ進む。
 * - `{ compatible: false, reason: "not-chromium" }` — 非 Chromium / SSR。
 * - `{ compatible: false, reason: "chrome-too-old" }` — バージョン不足。
 */
export function checkChromiumCompatibility(
  minVersion: number,
): { compatible: true } | { compatible: false; reason: "not-chromium" | "chrome-too-old" } {
  const isChromiumBased = typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent);
  if (!isChromiumBased) return { compatible: false, reason: "not-chromium" };
  const chromeVersion = getChromeVersionSafe();
  if (chromeVersion !== null && chromeVersion < minVersion) {
    return { compatible: false, reason: "chrome-too-old" };
  }
  return { compatible: true };
}
