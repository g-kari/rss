import { test, expect } from "@playwright/test";
import {
  computeProgress,
  buildAnchorSelector,
  clampProgress,
  scopeAnchorToContent,
} from "../src/lib/reading-progress";

// ===== computeProgress =====

test.describe("computeProgress — 読書進捗計算", () => {
  test("0 番目の要素は 0% を返す", () => {
    expect(computeProgress(0, 10)).toBe(0);
  });

  test("最後の要素は 100% を返す", () => {
    expect(computeProgress(9, 10)).toBe(100);
  });

  test("中間の要素は適切な % を返す", () => {
    const progress = computeProgress(5, 10);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  test("totalElements が 0 の場合は 0 を返す", () => {
    expect(computeProgress(0, 0)).toBe(0);
  });

  test("visibleIndex が totalElements 以上の場合は 100 を返す", () => {
    expect(computeProgress(10, 10)).toBe(100);
    expect(computeProgress(15, 10)).toBe(100);
  });

  test("結果は 0〜100 の整数である", () => {
    for (let i = 0; i <= 10; i++) {
      const p = computeProgress(i, 10);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      expect(Number.isInteger(p)).toBe(true);
    }
  });
});

// ===== buildAnchorSelector =====

test.describe("buildAnchorSelector — アンカーセレクタ生成", () => {
  test("index 1 のとき :nth-child(2) を含む", () => {
    const sel = buildAnchorSelector(1);
    expect(sel).toContain("nth-child");
    expect(sel).toContain("2");
  });

  test("index 2 のとき :nth-child(3) を含む", () => {
    const sel = buildAnchorSelector(2);
    expect(sel).toContain("3");
  });

  test("index が 0 のとき空文字を返す", () => {
    // 先頭は特別扱い — スクロールする必要がない
    expect(buildAnchorSelector(0)).toBe("");
  });

  test("index が負の場合は空文字を返す", () => {
    expect(buildAnchorSelector(-1)).toBe("");
  });

  test("返す文字列は CSS セレクタとして有効な形式", () => {
    const sel = buildAnchorSelector(5);
    // 少なくとも ':nth-child(' を含む
    expect(sel).toMatch(/:nth-child\(\d+\)/);
  });
});

// ===== clampProgress =====

test.describe("clampProgress — 進捗の正規化", () => {
  test("95 以上の進捗は 100 に丸める", () => {
    expect(clampProgress(95)).toBe(100);
    expect(clampProgress(99)).toBe(100);
    expect(clampProgress(100)).toBe(100);
  });

  test("0〜94 の進捗はそのまま返す", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(94)).toBe(94);
  });

  test("負の値は 0 に丸める", () => {
    expect(clampProgress(-10)).toBe(0);
  });

  test("100 を超える値は 100 に丸める", () => {
    expect(clampProgress(110)).toBe(100);
  });
});

// ===== scopeAnchorToContent =====

test.describe("scopeAnchorToContent — contentRef スコープ用 :scope 変換", () => {
  test(".article-content prefix を :scope に置換する", () => {
    expect(scopeAnchorToContent(".article-content > :nth-child(3)")).toBe(":scope > :nth-child(3)");
  });

  test("buildAnchorSelector の出力をそのまま変換できる", () => {
    expect(scopeAnchorToContent(buildAnchorSelector(2))).toBe(":scope > :nth-child(3)");
  });

  test("空文字はそのまま返す", () => {
    expect(scopeAnchorToContent("")).toBe("");
  });

  test(".article-content で始まらないセレクタはそのまま返す", () => {
    expect(scopeAnchorToContent(".other > :nth-child(2)")).toBe(".other > :nth-child(2)");
  });

  test("単語境界を尊重する (.article-contentX には誤マッチしない)", () => {
    expect(scopeAnchorToContent(".article-contentX > :nth-child(2)")).toBe(
      ".article-contentX > :nth-child(2)",
    );
  });
});
