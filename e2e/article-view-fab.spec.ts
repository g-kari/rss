import { test, expect } from "@playwright/test";
import { shouldShowBackToTopFab } from "../src/lib/article-view-fab";

/**
 * #1149: 記事詳細本文「先頭へ戻る」FAB 表示判定の純粋関数 spec。
 * 案 B (閾値 30%) + 案 C (TTS 中非表示) を併用採用、純粋関数で動作仕様を固定。
 */

test.describe("shouldShowBackToTopFab — 閾値 + TTS 中非表示", () => {
  test("progress > 30 + !ttsPlaying + !ttsPaused → 表示", () => {
    expect(shouldShowBackToTopFab(31, false, false)).toBe(true);
    expect(shouldShowBackToTopFab(50, false, false)).toBe(true);
    expect(shouldShowBackToTopFab(100, false, false)).toBe(true);
  });

  test("progress <= 30 → 非表示 (短記事 / 上端付近)", () => {
    expect(shouldShowBackToTopFab(0, false, false)).toBe(false);
    expect(shouldShowBackToTopFab(15, false, false)).toBe(false);
    expect(shouldShowBackToTopFab(30, false, false)).toBe(false);
  });

  test("ttsPlaying === true → 非表示 (TTS 再生中の意図しない scroll reset 防止)", () => {
    expect(shouldShowBackToTopFab(50, true, false)).toBe(false);
    expect(shouldShowBackToTopFab(99, true, false)).toBe(false);
  });

  test("ttsPaused === true → 非表示 (一時停止中も再生位置を維持)", () => {
    expect(shouldShowBackToTopFab(50, false, true)).toBe(false);
    expect(shouldShowBackToTopFab(99, false, true)).toBe(false);
  });

  test("境界値 progress = 31 → 表示", () => {
    expect(shouldShowBackToTopFab(31, false, false)).toBe(true);
  });

  test("境界値 progress = 30 → 非表示", () => {
    expect(shouldShowBackToTopFab(30, false, false)).toBe(false);
  });
});
