import { test, expect } from "@playwright/test";
import {
  isSummarizerApiSupported,
  shouldUseBrowserSummarizer,
  diagnoseSummarizerAvailability,
  summarizeInBrowser,
} from "../src/lib/browser-summarizer";

/**
 * Chrome Summarizer API ラッパーの純粋関数テスト。
 *
 * Node 実行では `self` / `Summarizer` は存在しないため、
 * `isSummarizerApiSupported` は常に false を返す。
 * 実ブラウザでの動作は E2E 側で確認する。
 */

// ==========================================================================
// isSummarizerApiSupported — Node 環境
// ==========================================================================

test.describe("isSummarizerApiSupported — Node 環境", () => {
  test("Summarizer が無い Node 環境では false", () => {
    // Node.js では `self` が未定義のため false
    expect(isSummarizerApiSupported()).toBe(false);
  });
});

// ==========================================================================
// shouldUseBrowserSummarizer — availability 判定
// （browser-translator.spec.ts の shouldUseBrowserTranslation と対称的に実装）
// ==========================================================================

test.describe("shouldUseBrowserSummarizer — availability 判定", () => {
  test("available は要約可", () => {
    expect(shouldUseBrowserSummarizer("available")).toBe(true);
  });

  test("downloadable は要約可（create() が自動DL）", () => {
    expect(shouldUseBrowserSummarizer("downloadable")).toBe(true);
  });

  test("downloading 中はフォールバック対象", () => {
    expect(shouldUseBrowserSummarizer("downloading")).toBe(false);
  });

  test("unavailable はフォールバック対象", () => {
    expect(shouldUseBrowserSummarizer("unavailable")).toBe(false);
  });
});

// ==========================================================================
// diagnoseSummarizerAvailability — Node 環境（API 未実装）
// ==========================================================================

test.describe("diagnoseSummarizerAvailability — Node 環境", () => {
  test("Summarizer が無い環境では available=false を返す", async () => {
    const result = await diagnoseSummarizerAvailability();
    expect(result.available).toBe(false);
  });

  test("Summarizer が無い環境では reason が null でない", async () => {
    const result = await diagnoseSummarizerAvailability();
    expect(result.reason).not.toBeNull();
  });

  test("Node.js 環境では有効な reason を返す", async () => {
    const result = await diagnoseSummarizerAvailability();
    // Node.js: navigator.userAgent に Chrome が無い → not-chromium
    // または Chrome あり & Summarizer なし → flag-disabled / chrome-too-old
    const validReasons: Array<string> = [
      "not-chromium",
      "chrome-too-old",
      "flag-disabled",
      "model-downloading",
      "model-unavailable",
    ];
    expect(validReasons).toContain(result.reason);
  });
});

// ==========================================================================
// summarizeInBrowser — Node 環境
// ==========================================================================

test.describe("summarizeInBrowser — Node 環境", () => {
  test("API が無い Node 環境では null を返す", async () => {
    const result = await summarizeInBrowser("some article text");
    expect(result).toBeNull();
  });

  test("空文字でも null を返す（API 非対応）", async () => {
    const result = await summarizeInBrowser("");
    expect(result).toBeNull();
  });
});
