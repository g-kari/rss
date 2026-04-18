import { test, expect } from "@playwright/test";
import {
  LINE_HEIGHT_CYCLE,
  CONTENT_WIDTH_CYCLE,
  FONT_SIZE_CYCLE_EXTENDED,
  getLineHeightStyle,
  getContentWidthStyle,
  getFontSizeStyle,
  cycleLineHeight,
  cycleContentWidth,
  cycleFontSizeExtended,
} from "../src/lib/reader-settings";

// ===== フォントサイズ (拡張版: 6段階) =====

test.describe("FONT_SIZE_CYCLE_EXTENDED — 6段階サイクル", () => {
  test("6段階のフォントサイズ定数を持つ", () => {
    expect(FONT_SIZE_CYCLE_EXTENDED).toHaveLength(6);
  });

  test("最小から最大まで昇順で並んでいる", () => {
    const sizes = FONT_SIZE_CYCLE_EXTENDED.map((s) => getFontSizeStyle(s).fontSize as string);
    for (let i = 1; i < sizes.length; i++) {
      const prev = parseInt(sizes[i - 1]!);
      const curr = parseInt(sizes[i]!);
      expect(curr).toBeGreaterThan(prev);
    }
  });

  test("getFontSizeStyle が各サイズに対応する fontSize を返す", () => {
    for (const size of FONT_SIZE_CYCLE_EXTENDED) {
      const style = getFontSizeStyle(size);
      expect(style.fontSize).toMatch(/^\d+px$/);
    }
  });

  test("cycleFontSizeExtended が次のサイズに進む", () => {
    const first = FONT_SIZE_CYCLE_EXTENDED[0];
    const second = FONT_SIZE_CYCLE_EXTENDED[1];
    expect(cycleFontSizeExtended(first)).toBe(second);
  });

  test("cycleFontSizeExtended が末尾から先頭に戻る", () => {
    const last = FONT_SIZE_CYCLE_EXTENDED[FONT_SIZE_CYCLE_EXTENDED.length - 1];
    const first = FONT_SIZE_CYCLE_EXTENDED[0];
    expect(cycleFontSizeExtended(last)).toBe(first);
  });
});

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

  test("cycleLineHeight が次の行間に進む", () => {
    const first = LINE_HEIGHT_CYCLE[0];
    const second = LINE_HEIGHT_CYCLE[1];
    expect(cycleLineHeight(first)).toBe(second);
  });

  test("cycleLineHeight が末尾から先頭に戻る", () => {
    const last = LINE_HEIGHT_CYCLE[LINE_HEIGHT_CYCLE.length - 1];
    const first = LINE_HEIGHT_CYCLE[0];
    expect(cycleLineHeight(last)).toBe(first);
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

  test("cycleContentWidth が次の幅に進む", () => {
    const first = CONTENT_WIDTH_CYCLE[0];
    const second = CONTENT_WIDTH_CYCLE[1];
    expect(cycleContentWidth(first)).toBe(second);
  });

  test("cycleContentWidth が末尾から先頭に戻る", () => {
    const last = CONTENT_WIDTH_CYCLE[CONTENT_WIDTH_CYCLE.length - 1];
    const first = CONTENT_WIDTH_CYCLE[0];
    expect(cycleContentWidth(last)).toBe(first);
  });
});
