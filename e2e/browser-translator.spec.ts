import { test, expect } from "@playwright/test";
import {
  isTranslatorApiSupported,
  shouldUseBrowserTranslation,
} from "../src/lib/browser-translator";

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

test.describe("shouldUseBrowserTranslation — availability 判定", () => {
  test("available のみ即時翻訳可", () => {
    expect(shouldUseBrowserTranslation("available")).toBe(true);
  });

  test("downloadable はフォールバック対象", () => {
    expect(shouldUseBrowserTranslation("downloadable")).toBe(false);
  });

  test("downloading 中はフォールバック対象", () => {
    expect(shouldUseBrowserTranslation("downloading")).toBe(false);
  });

  test("unavailable はフォールバック対象", () => {
    expect(shouldUseBrowserTranslation("unavailable")).toBe(false);
  });
});
