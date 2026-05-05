import { test, expect } from "@playwright/test";
import { isParsedHtmlResult } from "../src/lib/linkedom-types";
import { parseHTML } from "linkedom/worker";

test.describe("isParsedHtmlResult — parseHTML 戻り値の型ガード", () => {
  test("正常な parseHTML 結果は true", () => {
    const result = parseHTML("<html><body><p>hi</p></body></html>");
    expect(isParsedHtmlResult(result)).toBe(true);
  });

  test("null は false", () => {
    expect(isParsedHtmlResult(null)).toBe(false);
  });

  test("undefined は false", () => {
    expect(isParsedHtmlResult(undefined)).toBe(false);
  });

  test("プリミティブは false", () => {
    expect(isParsedHtmlResult("string")).toBe(false);
    expect(isParsedHtmlResult(123)).toBe(false);
    expect(isParsedHtmlResult(true)).toBe(false);
  });

  test("document を持たないオブジェクトは false", () => {
    expect(isParsedHtmlResult({})).toBe(false);
    expect(isParsedHtmlResult({ foo: "bar" })).toBe(false);
  });

  test("document が null は false", () => {
    expect(isParsedHtmlResult({ document: null })).toBe(false);
  });

  test("document に必要なメソッドが欠けていれば false", () => {
    expect(isParsedHtmlResult({ document: {} })).toBe(false);
    expect(isParsedHtmlResult({ document: { querySelectorAll: () => [] } })).toBe(false);
  });
});
