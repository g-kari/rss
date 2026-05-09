import { test, expect } from "@playwright/test";
import { evaluateAutoReadDebugEnabled } from "../src/lib/auto-read-debug";

test.describe("evaluateAutoReadDebugEnabled — localStorage 値の純粋判定 (#678)", () => {
  test("'1' → true (有効化)", () => {
    expect(evaluateAutoReadDebugEnabled("1")).toBe(true);
  });

  test("null (未設定) → false", () => {
    expect(evaluateAutoReadDebugEnabled(null)).toBe(false);
  });

  test("'0' → false", () => {
    expect(evaluateAutoReadDebugEnabled("0")).toBe(false);
  });

  test("空文字 → false", () => {
    expect(evaluateAutoReadDebugEnabled("")).toBe(false);
  });

  test("'true' (文字列) → false (厳密に '1' のみ)", () => {
    expect(evaluateAutoReadDebugEnabled("true")).toBe(false);
  });

  test("'1 ' (末尾スペース) → false (厳密一致)", () => {
    expect(evaluateAutoReadDebugEnabled("1 ")).toBe(false);
  });

  test("'2' → false (1 以外の数字も無効)", () => {
    expect(evaluateAutoReadDebugEnabled("2")).toBe(false);
  });
});
