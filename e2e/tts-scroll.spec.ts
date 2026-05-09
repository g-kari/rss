import { test, expect } from "@playwright/test";
import { shouldScrollSentence } from "../src/lib/tts-scroll";

test.describe("shouldScrollSentence — 快適ゾーン判定 (#659)", () => {
  // viewport / scroll container を 1000px と仮定 (containerTop=0, containerBottom=1000)
  // → 快適ゾーン デフォルト 30〜70% = 300〜700px

  test("要素中心が快適ゾーン内 (350px) → スクロール不要", () => {
    const result = shouldScrollSentence({
      elementTop: 320,
      elementBottom: 380,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(false);
  });

  test("要素中心が快適ゾーン中央 (500px) → スクロール不要", () => {
    const result = shouldScrollSentence({
      elementTop: 480,
      elementBottom: 520,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(false);
  });

  test("要素中心が快適ゾーンより上 (200px) → スクロール必要", () => {
    const result = shouldScrollSentence({
      elementTop: 180,
      elementBottom: 220,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(true);
  });

  test("要素中心が快適ゾーンより下 (800px) → スクロール必要", () => {
    const result = shouldScrollSentence({
      elementTop: 780,
      elementBottom: 820,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(true);
  });

  test("要素が画面下部基準 (画像直後で 900px) → スクロール必要", () => {
    // ユーザー報告: 画像が大きいと scrollIntoView nearest で画面下部に来てしまう
    const result = shouldScrollSentence({
      elementTop: 880,
      elementBottom: 920,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(true);
  });

  test("要素中心がちょうど境界 (300px) → スクロール不要 (境界は内側扱い)", () => {
    // elementTop=290, elementBottom=310 → center=300 = comfortTop
    const result = shouldScrollSentence({
      elementTop: 290,
      elementBottom: 310,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(false);
  });

  test("要素中心がちょうど下境界 (700px) → スクロール不要", () => {
    const result = shouldScrollSentence({
      elementTop: 690,
      elementBottom: 710,
      containerTop: 0,
      containerBottom: 1000,
    });
    expect(result.shouldScroll).toBe(false);
  });

  test("カスタム快適ゾーン (40〜60%) で要素 250px → スクロール必要", () => {
    const result = shouldScrollSentence({
      elementTop: 240,
      elementBottom: 260,
      containerTop: 0,
      containerBottom: 1000,
      comfortZoneTop: 0.4,
      comfortZoneBottom: 0.6,
    });
    expect(result.shouldScroll).toBe(true);
  });

  test("コンテナ高さ 0 → スクロール不要 (ガード)", () => {
    const result = shouldScrollSentence({
      elementTop: 100,
      elementBottom: 200,
      containerTop: 500,
      containerBottom: 500,
    });
    expect(result.shouldScroll).toBe(false);
  });

  test("コンテナ top が 0 でない場合 (overlay 等)", () => {
    // container 200〜1200 (高さ 1000), 快適ゾーン 200+300=500〜200+700=900
    // 要素中心 600 → ゾーン内
    const result = shouldScrollSentence({
      elementTop: 580,
      elementBottom: 620,
      containerTop: 200,
      containerBottom: 1200,
    });
    expect(result.shouldScroll).toBe(false);
  });

  test("コンテナ top が 0 でない場合・要素が下部 → スクロール必要", () => {
    // container 200〜1200, comfortBottom = 200 + 1000*0.7 = 900
    // 要素中心 1000 → ゾーン外
    const result = shouldScrollSentence({
      elementTop: 980,
      elementBottom: 1020,
      containerTop: 200,
      containerBottom: 1200,
    });
    expect(result.shouldScroll).toBe(true);
  });
});
