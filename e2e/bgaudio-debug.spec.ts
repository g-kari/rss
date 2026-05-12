import { test, expect } from "@playwright/test";
import { evaluateBgAudioDebugEnabled } from "../src/lib/bgaudio-debug";

/**
 * `evaluateBgAudioDebugEnabled` 純粋判定関数の spec (#745 Phase C 案 B)。
 * `auto-read-debug.ts` の `evaluateAutoReadDebugEnabled` と同 pattern (厳密一致 "1" のみ true)。
 */
test.describe("evaluateBgAudioDebugEnabled", () => {
  test("'1' は true (debug 有効)", () => {
    expect(evaluateBgAudioDebugEnabled("1")).toBe(true);
  });

  test("null は false (未設定)", () => {
    expect(evaluateBgAudioDebugEnabled(null)).toBe(false);
  });

  test("空文字は false", () => {
    expect(evaluateBgAudioDebugEnabled("")).toBe(false);
  });

  test("'0' は false", () => {
    expect(evaluateBgAudioDebugEnabled("0")).toBe(false);
  });

  test("'true' は false (厳密一致のみ true)", () => {
    expect(evaluateBgAudioDebugEnabled("true")).toBe(false);
  });

  test("'1 ' (末尾空白) は false (厳密一致のみ true)", () => {
    expect(evaluateBgAudioDebugEnabled("1 ")).toBe(false);
  });
});
