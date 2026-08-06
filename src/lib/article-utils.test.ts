/**
 * vitest smoke test (#682 Phase A)
 *
 * vitest + happy-dom + @testing-library/jest-dom matcher が動作することを保証する
 * smoke test。実検証は既存 e2e/article-utils.spec.ts (Playwright) で網羅済。
 *
 * Phase B 以降で React component test を追加するときの動作確認基盤として残す。
 */
import { describe, it, expect } from "vitest";
import { cycleValue, readingTime, formatCount, resolveThumbnail } from "./article-utils";

describe("article-utils (vitest smoke)", () => {
  it("readingTime: 空 HTML は 0 を返す", () => {
    expect(readingTime("")).toBe(0);
  });

  it("formatCount: 100 以上は '99+' を返す", () => {
    expect(formatCount(50)).toBe("50");
    expect(formatCount(100)).toBe("99+");
  });

  it("formatCount: 負数は 0 に正規化する", () => {
    expect(formatCount(-1)).toBe("0");
  });

  it("formatCount: NaN と負の無限大は 0 に正規化する", () => {
    expect(formatCount(Number.NaN)).toBe("0");
    expect(formatCount(Number.NEGATIVE_INFINITY)).toBe("0");
  });

  it("formatCount: 正の無限大も 0 に正規化する", () => {
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("cycleValue: 空のサイクルは明示的に失敗する", () => {
    expect(() => cycleValue([], "current")).toThrow("cycle must not be empty");
  });

  it("cycleValue: 現在値が存在しなければ先頭から再開する", () => {
    expect(cycleValue(["a", "b"], "missing")).toBe("a");
  });

  it("resolveThumbnail: YouTube embed URL からサムネイルを解決する", () => {
    const article = {
      id: "id",
      feedHash: "feed",
      guid: "guid",
      title: "title",
      link: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      summary: "summary",
      publishedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(resolveThumbnail(article, {})).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });
});
