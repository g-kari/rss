import { test, expect } from "@playwright/test";
import { isTranslatorApiSupported } from "../src/lib/browser-translator";
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
