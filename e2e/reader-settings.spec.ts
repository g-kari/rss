import { test, expect } from "@playwright/test";
import {
  LINE_HEIGHT_CYCLE,
  CONTENT_WIDTH_CYCLE,
  getLineHeightStyle,
  getContentWidthStyle,
} from "../src/lib/reader-settings";

// ===== 行間 =====

test.describe("LINE_HEIGHT_CYCLE — 行間設定", () => {
  test("5段階の行間定数を持つ", () => {
    expect(LINE_HEIGHT_CYCLE).toHaveLength(5);
  });

  test("getLineHeightStyle が lineHeight を返す", () => {
    for (const lh of LINE_HEIGHT_CYCLE) {
      const style = getLineHeightStyle(lh);
      expect(typeof style.lineHeight).toBe("number");
      expect(style.lineHeight).toBeGreaterThan(1);
    }
  });

  test("行間は昇順で並んでいる", () => {
    const values = LINE_HEIGHT_CYCLE.map((lh) => getLineHeightStyle(lh).lineHeight as number);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

// ===== コンテンツ幅 =====

test.describe("CONTENT_WIDTH_CYCLE — コンテンツ幅設定", () => {
  test("4段階の幅定数を持つ", () => {
    expect(CONTENT_WIDTH_CYCLE).toHaveLength(4);
  });

  test("getContentWidthStyle が maxWidth を返す", () => {
    for (const w of CONTENT_WIDTH_CYCLE) {
      const style = getContentWidthStyle(w);
      expect(style.maxWidth).toBeDefined();
    }
  });

  test("幅 'wide' は 'narrow' より大きな maxWidth を持つ (または none)", () => {
    const narrow = getContentWidthStyle(CONTENT_WIDTH_CYCLE[0]);
    const wide = getContentWidthStyle(CONTENT_WIDTH_CYCLE[CONTENT_WIDTH_CYCLE.length - 1]);
    // wide は none か、数値が大きい
    const narrowVal = parseInt(narrow.maxWidth as string) || 0;
    const wideVal = parseInt(wide.maxWidth as string) || Infinity;
    expect(wideVal).toBeGreaterThanOrEqual(narrowVal);
  });
});
