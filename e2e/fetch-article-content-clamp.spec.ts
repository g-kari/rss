import { test, expect } from "@playwright/test";
import { clampContentBytes, MAX_RETURNED_CONTENT_BYTES } from "../src/lib/fetch-article-content";

test.describe("clampContentBytes — UTF-8 バイト長で切り詰める", () => {
  test("上限以下の入力はそのまま返す", () => {
    const input = "短い文字列です";
    expect(clampContentBytes(input, 1024)).toBe(input);
  });

  test("上限を超える入力は切り詰める（ASCII）", () => {
    const input = "a".repeat(100);
    const out = clampContentBytes(input, 50);
    expect(out.length).toBe(50);
  });

  test("UTF-8 多バイト文字も安全に処理する", () => {
    // 「あ」は UTF-8 で 3 バイト
    const input = "あ".repeat(100);
    const out = clampContentBytes(input, 30);
    // 30 バイトちょうど（あ x 10）か、置換文字で終わる可能性があるため、バイト長で検証
    const outBytes = new TextEncoder().encode(out).byteLength;
    expect(outBytes).toBeLessThanOrEqual(30);
  });

  test("デフォルト上限は MAX_RETURNED_CONTENT_BYTES", () => {
    expect(MAX_RETURNED_CONTENT_BYTES).toBe(5 * 1024 * 1024);
    const input = "x";
    expect(clampContentBytes(input)).toBe(input);
  });

  test("空文字列はそのまま返す", () => {
    expect(clampContentBytes("", 100)).toBe("");
  });
});
