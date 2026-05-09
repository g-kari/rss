import { test, expect } from "@playwright/test";
import { shouldSkipAutoAi } from "../src/lib/auto-ai-fallback";

test.describe("shouldSkipAutoAi (#700)", () => {
  test("設定 OFF (browserOnlyEnabled=false) なら常に skip しない", () => {
    expect(shouldSkipAutoAi(true, false)).toBe(false);
    expect(shouldSkipAutoAi(false, false)).toBe(false);
    expect(shouldSkipAutoAi(null, false)).toBe(false);
  });

  test("設定 ON + ブラウザ AI 利用可能 → skip しない (trigger OK)", () => {
    expect(shouldSkipAutoAi(true, true)).toBe(false);
  });

  test("設定 ON + ブラウザ AI 不可 → skip (Workers AI フォールバック防止)", () => {
    expect(shouldSkipAutoAi(false, true)).toBe(true);
  });

  test("設定 ON + 診断中 (null) → 安全側に skip", () => {
    expect(shouldSkipAutoAi(null, true)).toBe(true);
  });
});
