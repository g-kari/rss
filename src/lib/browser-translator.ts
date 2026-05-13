/**
 * Chrome 138+ の組み込み Translator / LanguageDetector API ラッパー。
 *
 * 利用できる環境ではブラウザ側で翻訳を完結させ、Workers AI コスト・レイテンシを削減する。
 * 非対応（Safari / Firefox / 古い Chrome）では呼び出し側が従来の Workers AI にフォールバックする。
 *
 * 仕様: https://developer.chrome.com/docs/ai/translator-api
 */

import { isLikelyJapanese } from "./article-utils";
import { devError } from "./dev-log";
import { parseChromeMajorVersion } from "./browser-summarizer";

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

interface BrowserTranslator {
  translate(text: string): Promise<string>;
}

interface BrowserTranslatorConstructor {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslator>;
}

interface BrowserLanguageDetector {
  detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}

interface BrowserLanguageDetectorConstructor {
  availability(): Promise<Availability>;
  create(): Promise<BrowserLanguageDetector>;
}

declare global {
  interface Window {
    Translator?: BrowserTranslatorConstructor;
    LanguageDetector?: BrowserLanguageDetectorConstructor;
  }
}

/** Translator API が stable で利用可能になった最低 Chrome メジャーバージョン (公式: 138)。 */
export const MIN_TRANSLATOR_CHROME_VERSION = 138;

/** Translator API が window 上に実装されているかをチェックする。 */
export function isTranslatorApiSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Translator !== "undefined";
}

/**
 * 入力テキストの主言語を推定する。
 * - `LanguageDetector` が使える場合はそれを利用（信頼度 0.5 超）
 * - 非対応環境では `isLikelyJapanese()` の結果から `"ja" | "en"` を返す
 */
export async function detectSourceLanguage(text: string): Promise<string> {
  const sample = text.slice(0, 500);
  if (typeof window !== "undefined" && window.LanguageDetector) {
    try {
      const availability = await window.LanguageDetector.availability();
      if (shouldUseBrowserTranslation(availability)) {
        const detector = await window.LanguageDetector.create();
        const results = await detector.detect(sample);
        const top = results[0];
        if (top && top.confidence > 0.5) return top.detectedLanguage;
      }
    } catch (e) {
      devError("[browser-translator] detectSourceLanguage LanguageDetector threw", e);
    }
  }
  return isLikelyJapanese(sample) ? "ja" : "en";
}

/**
 * 判定された availability に基づいてブラウザ翻訳を使用できるかを返す。
 * - `available`: 即時翻訳可能
 * - `downloadable`: モデル未DLだが `Translator.create()` が自動DLするため利用可
 * - `downloading` / `unavailable`: サーバー AI にフォールバック推奨
 */
export function shouldUseBrowserTranslation(availability: Availability): boolean {
  return availability === "available" || availability === "downloadable";
}

export type TranslatorUnavailableReason =
  | "not-chromium"
  | "chrome-too-old"
  | "flag-disabled"
  | "not-available"
  | null;

/**
 * Chrome Translator API の利用可否を診断し、利用不可の場合はその理由を返す。
 * UserSettingsModal でプロバイダ情報を表示するために使う。
 */
export async function diagnoseTranslatorAvailability(): Promise<{
  available: boolean;
  reason: TranslatorUnavailableReason;
}> {
  if (typeof window === "undefined") return { available: false, reason: "not-chromium" };
  if (typeof window.Translator === "undefined") {
    const isChromiumBased = /Chrome\//.test(navigator.userAgent);
    if (!isChromiumBased) return { available: false, reason: "not-chromium" };
    const chromeVersion =
      typeof navigator !== "undefined" ? parseChromeMajorVersion(navigator.userAgent) : null;
    if (chromeVersion !== null && chromeVersion < MIN_TRANSLATOR_CHROME_VERSION) {
      return { available: false, reason: "chrome-too-old" };
    }
    return { available: false, reason: "flag-disabled" };
  }
  try {
    const availability = await window.Translator.availability({
      sourceLanguage: "en",
      targetLanguage: "ja",
    });
    if (shouldUseBrowserTranslation(availability)) return { available: true, reason: null };
    return { available: false, reason: "not-available" };
  } catch (err) {
    devError("[browser-translator] diagnose availability failed", err);
    return { available: false, reason: "not-available" };
  }
}

/**
 * Chrome Translator API で翻訳を実行する。
 *
 * @returns 翻訳結果。以下のケースでは `null` を返し、呼び出し側はサーバー AI にフォールバックする:
 *   - API 非対応環境
 *   - 言語ペアが `"downloading"` / `"unavailable"`
 *   - 原文言語がターゲット言語と同じ（翻訳不要）
 *   - 例外発生時
 */
export async function translateInBrowser(
  text: string,
  targetLanguage: string = "ja",
): Promise<string | null> {
  if (!isTranslatorApiSupported() || !window.Translator) return null;

  const sourceLanguage = await detectSourceLanguage(text);
  if (sourceLanguage === targetLanguage) return null;

  try {
    const availability = await window.Translator.availability({ sourceLanguage, targetLanguage });
    if (!shouldUseBrowserTranslation(availability)) return null;

    const translator = await window.Translator.create({ sourceLanguage, targetLanguage });
    return await translator.translate(text);
  } catch (err) {
    devError("[browser-translator] translate failed", err);
    return null;
  }
}
