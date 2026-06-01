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
import {
  checkChromiumCompatibility,
  shouldUseBrowserAi,
  MIN_BROWSER_AI_CHROME_VERSION,
} from "./browser-ai-common";
import type { BrowserAiAvailability } from "./browser-ai-common";

type Availability = BrowserAiAvailability;

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

/** Translator API が stable で利用可能になった最低 Chrome メジャーバージョン。`browser-ai-common.ts` の canonical 定義への re-export alias。 */
export const MIN_TRANSLATOR_CHROME_VERSION = MIN_BROWSER_AI_CHROME_VERSION;

/**
 * `window.Translator.availability()` および `window.Translator.create()` に渡す
 * 共通オプション。複数箇所でインライン重複せず TRANSLATOR_OPTIONS を参照する。
 */
export const TRANSLATOR_OPTIONS = {
  sourceLanguage: "en",
  targetLanguage: "ja",
} as const;

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
      if (shouldUseBrowserAi(availability)) {
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
  if (typeof window === "undefined" || typeof window.Translator === "undefined") {
    const compat = checkChromiumCompatibility(MIN_TRANSLATOR_CHROME_VERSION);
    if (!compat.compatible) return { available: false, reason: compat.reason };
    return { available: false, reason: "flag-disabled" };
  }
  try {
    const availability = await window.Translator.availability(TRANSLATOR_OPTIONS);
    if (shouldUseBrowserAi(availability)) return { available: true, reason: null };
    return { available: false, reason: "not-available" };
  } catch (err) {
    devError("[browser-translator] diagnose availability failed", {
      err,
      options: TRANSLATOR_OPTIONS,
    });
    return { available: false, reason: "not-available" };
  }
}
