import { test, expect } from "@playwright/test";
import {
  isTranslatorApiSupported,
  MIN_TRANSLATOR_CHROME_VERSION,
  TRANSLATOR_OPTIONS,
} from "../src/lib/browser-translator";
import { shouldUseBrowserAi } from "../src/lib/browser-ai-common";

/**
 * Chrome Translator API ラッパーの純粋関数テスト。
 *
 * Node 実行では window / Translator は存在しないため、
 * `isTranslatorApiSupported` は常に false を返す。実ブラウザでの動作は E2E 側で確認する。
 */

test.describe("isTranslatorApiSupported — Node 環境", () => {
  test("window が無い Node 環境では false", () => {
    expect(isTranslatorApiSupported()).toBe(false);
  });
});

// ==========================================================================
// MIN_TRANSLATOR_CHROME_VERSION — 公式仕様準拠（138+）
// ==========================================================================

test.describe("MIN_TRANSLATOR_CHROME_VERSION — 仕様整合性", () => {
  test("最低バージョンは 138（Translator API stable リリース）", () => {
    // 公式: https://developer.chrome.com/docs/ai/translator-api
    // Chrome 138 で stable 提供（browser-ai-common.ts の canonical 定義への re-export alias）
    expect(MIN_TRANSLATOR_CHROME_VERSION).toBe(138);
  });
});

// ==========================================================================
// TRANSLATOR_OPTIONS — Chrome 公式仕様準拠の enum 値
// ==========================================================================

test.describe("TRANSLATOR_OPTIONS — Chrome 公式仕様準拠", () => {
  test("sourceLanguage が string 型である", () => {
    expect(typeof TRANSLATOR_OPTIONS.sourceLanguage).toBe("string");
  });

  test("sourceLanguage が 'en' である（入力英語翻訳を前提）", () => {
    expect(TRANSLATOR_OPTIONS.sourceLanguage).toBe("en");
  });

  test("targetLanguage が string 型である", () => {
    expect(typeof TRANSLATOR_OPTIONS.targetLanguage).toBe("string");
  });

  test("targetLanguage が 'ja' である（日本語出力を前提）", () => {
    expect(TRANSLATOR_OPTIONS.targetLanguage).toBe("ja");
  });
});

test.describe("shouldUseBrowserAi — availability 判定", () => {
  test("available は翻訳可", () => {
    expect(shouldUseBrowserAi("available")).toBe(true);
  });

  test("downloadable は翻訳可（create() が自動DL）", () => {
    expect(shouldUseBrowserAi("downloadable")).toBe(true);
  });

  test("downloading 中はフォールバック対象", () => {
    expect(shouldUseBrowserAi("downloading")).toBe(false);
  });

  test("unavailable はフォールバック対象", () => {
    expect(shouldUseBrowserAi("unavailable")).toBe(false);
  });
});
