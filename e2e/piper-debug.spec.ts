import { test, expect } from "@playwright/test";
import { evaluatePiperDebugEnabled } from "../src/lib/piper-debug";

/**
 * `evaluatePiperDebugEnabled` 純粋判定関数の spec (#1055)。
 * `bgaudio-debug.ts` / `auto-read-debug.ts` と同 pattern (厳密一致 "1" のみ true)。
 */
test.describe("evaluatePiperDebugEnabled", () => {
  test("'1' は true (debug 有効)", () => {
    expect(evaluatePiperDebugEnabled("1")).toBe(true);
  });

  test("null は false (未設定)", () => {
    expect(evaluatePiperDebugEnabled(null)).toBe(false);
  });

  test("空文字は false", () => {
    expect(evaluatePiperDebugEnabled("")).toBe(false);
  });

  test("'0' は false", () => {
    expect(evaluatePiperDebugEnabled("0")).toBe(false);
  });

  test("'true' は false (厳密一致のみ true)", () => {
    expect(evaluatePiperDebugEnabled("true")).toBe(false);
  });

  test("'1 ' (末尾空白) は false (厳密一致のみ true)", () => {
    expect(evaluatePiperDebugEnabled("1 ")).toBe(false);
  });
});
