import { test, expect } from "@playwright/test";
import { isValidCookieHeader } from "../src/lib/validation";

test.describe("isValidCookieHeader", () => {
  test.describe("正常ケース", () => {
    test("シンプルな Cookie は通過する", () => {
      expect(isValidCookieHeader("session=abc123")).toBe(true);
    });

    test("セミコロン区切りの複数ペアは通過する", () => {
      expect(isValidCookieHeader("session=abc123; csrf=xyz")).toBe(true);
    });

    test("英数字・ハイフンの name は通過する", () => {
      expect(isValidCookieHeader("my-token=abc; x-csrf=def")).toBe(true);
    });

    test("印字可能 ASCII の value は通過する", () => {
      expect(isValidCookieHeader("token=abc!@#$%^&*()")).toBe(true);
    });

    test("1999 文字の value は通過する", () => {
      const value = `session=${"a".repeat(1990)}`;
      expect(value.length).toBeLessThanOrEqual(2000);
      expect(isValidCookieHeader(value)).toBe(true);
    });
  });

  test.describe("CRLF インジェクション", () => {
    test("CRLF を含む Cookie は拒否される", () => {
      expect(isValidCookieHeader("session=abc\r\nX-Injected: evil")).toBe(false);
    });

    test("CR のみを含む Cookie は拒否される", () => {
      expect(isValidCookieHeader("session=abc\rX-Injected: evil")).toBe(false);
    });

    test("LF のみを含む Cookie は拒否される", () => {
      expect(isValidCookieHeader("session=abc\nX-Injected: evil")).toBe(false);
    });
  });

  test.describe("長さ制限", () => {
    test("2001 文字は拒否される", () => {
      expect(isValidCookieHeader("a=".padEnd(2001, "b"))).toBe(false);
    });

    test("2000 文字ちょうどは通過する", () => {
      const name = "a";
      const val = "b".repeat(2000 - 2); // "a=" + val = 2000
      expect(isValidCookieHeader(`${name}=${val}`)).toBe(true);
    });
  });

  test.describe("制御文字", () => {
    test("NULL 文字は拒否される", () => {
      expect(isValidCookieHeader("session=abc\x00")).toBe(false);
    });

    test("タブ文字は拒否される", () => {
      expect(isValidCookieHeader("session=abc\t")).toBe(false);
    });

    test("DEL 文字は拒否される", () => {
      expect(isValidCookieHeader("session=abc\x7f")).toBe(false);
    });
  });

  test.describe("Cookie jar poisoning", () => {
    test("セミコロン区切りで追加のペアを持つ文字列は valid（複数 Cookie）", () => {
      // RFC 6265: `;` は Cookie 区切り文字なので複数ペアは正常
      expect(isValidCookieHeader("session=abc; injected=evil")).toBe(true);
    });

    test("value にカンマを含む場合は拒否される", () => {
      expect(isValidCookieHeader("session=abc,evil")).toBe(false);
    });

    test("末尾セミコロンで空ペアが生じる場合は拒否される", () => {
      // "session=abc;" → split → ["session=abc", ""] → eqIdx <= 0 で拒否
      expect(isValidCookieHeader("session=abc;")).toBe(false);
    });
  });

  test.describe("フォーマット違反", () => {
    test("= のない単純な文字列は拒否される", () => {
      expect(isValidCookieHeader("invalid-cookie")).toBe(false);
    });

    test("name が空の場合は拒否される", () => {
      expect(isValidCookieHeader("=value")).toBe(false);
    });

    test("name に空白を含む場合は拒否される", () => {
      expect(isValidCookieHeader("session name=abc")).toBe(false);
    });
  });
});
