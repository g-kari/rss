import { test, expect } from "@playwright/test";
import { parseSummaryLine, parseSummaryLines } from "../src/lib/ai-summary-parse";

/**
 * #811 AI summary parse 純粋関数 spec。
 *
 * 本番 minified エラー `TypeError: e.startsWith is not a function` を構造的に防ぐため、
 * 非 string 入力に対する safe fallback を spec で固定。
 */

test.describe("parseSummaryLine — 単行分類", () => {
  test("'## H' は heading (3 文字 prefix 除去)", () => {
    expect(parseSummaryLine("## Heading")).toEqual({ kind: "heading", text: "Heading" });
  });

  test("'・ bullet' は bullet (marker + 空白 除去、空白必須)", () => {
    expect(parseSummaryLine("・ 項目 1")).toEqual({ kind: "bullet", text: "項目 1" });
  });

  test("'・bullet' (marker 直後に空白なし) は paragraph (現行仕様維持)", () => {
    expect(parseSummaryLine("・項目 1")).toEqual({ kind: "paragraph", text: "・項目 1" });
  });

  test("'- bullet' は bullet (marker + 空白 除去)", () => {
    expect(parseSummaryLine("- item")).toEqual({ kind: "bullet", text: "item" });
  });

  test("'• bullet' は bullet (marker + 空白 除去)", () => {
    expect(parseSummaryLine("• item")).toEqual({ kind: "bullet", text: "item" });
  });

  test("空文字は empty", () => {
    expect(parseSummaryLine("")).toEqual({ kind: "empty", text: "" });
  });

  test("空白のみは empty", () => {
    expect(parseSummaryLine("   ")).toEqual({ kind: "empty", text: "" });
  });

  test("通常テキストは paragraph", () => {
    expect(parseSummaryLine("plain text")).toEqual({ kind: "paragraph", text: "plain text" });
  });

  test("defensive: undefined は paragraph + 空文字", () => {
    expect(parseSummaryLine(undefined)).toEqual({ kind: "paragraph", text: "" });
  });

  test("defensive: null は paragraph + 空文字", () => {
    expect(parseSummaryLine(null)).toEqual({ kind: "paragraph", text: "" });
  });

  test("defensive: number は paragraph + 空文字 (#811 原因 type 不一致)", () => {
    expect(parseSummaryLine(42)).toEqual({ kind: "paragraph", text: "" });
  });

  test("defensive: object は paragraph + 空文字 (#811 原因 type 不一致)", () => {
    expect(parseSummaryLine({ text: "x" })).toEqual({ kind: "paragraph", text: "" });
  });

  test("defensive: array は paragraph + 空文字", () => {
    expect(parseSummaryLine(["a"])).toEqual({ kind: "paragraph", text: "" });
  });
});

test.describe("parseSummaryLines — 全行分類", () => {
  test("複合 text を 1 度に分類", () => {
    const result = parseSummaryLines("## Heading\n- bullet\nplain text\n\n空行混在");
    expect(result).toEqual([
      { kind: "heading", text: "Heading" },
      { kind: "bullet", text: "bullet" },
      { kind: "paragraph", text: "plain text" },
      { kind: "empty", text: "" },
      { kind: "paragraph", text: "空行混在" },
    ]);
  });

  test("単一 line も配列で返す", () => {
    expect(parseSummaryLines("plain")).toEqual([{ kind: "paragraph", text: "plain" }]);
  });

  test("空文字は [empty] を返す (split で 1 件)", () => {
    expect(parseSummaryLines("")).toEqual([{ kind: "empty", text: "" }]);
  });

  test("defensive: undefined は空配列 (#811 真因 fallback)", () => {
    expect(parseSummaryLines(undefined)).toEqual([]);
  });

  test("defensive: null は空配列", () => {
    expect(parseSummaryLines(null)).toEqual([]);
  });

  test("defensive: number は空配列", () => {
    expect(parseSummaryLines(42)).toEqual([]);
  });

  test("defensive: object は空配列", () => {
    expect(parseSummaryLines({ text: "x" })).toEqual([]);
  });

  test("行末改行を含む text も正常に分類", () => {
    const result = parseSummaryLines("## H\nbody\n");
    expect(result).toEqual([
      { kind: "heading", text: "H" },
      { kind: "paragraph", text: "body" },
      { kind: "empty", text: "" },
    ]);
  });
});
