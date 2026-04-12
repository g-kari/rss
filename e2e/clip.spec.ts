import { test, expect } from "@playwright/test";
import { validateClipRequest } from "../src/lib/clip";

// ===== validateClipRequest =====

test.describe("validateClipRequest — リクエスト検証", () => {
  test("html と url があれば ok: true を返す", () => {
    const result = validateClipRequest({ html: "<p>content</p>", url: "https://example.com" });
    expect(result.ok).toBe(true);
  });

  test("html が空文字の場合は ok: false", () => {
    const result = validateClipRequest({ html: "", url: "https://example.com" });
    expect(result.ok).toBe(false);
  });

  test("html が undefined の場合は ok: false", () => {
    const result = validateClipRequest({ html: undefined, url: "https://example.com" });
    expect(result.ok).toBe(false);
  });

  test("url が空文字の場合は ok: false", () => {
    const result = validateClipRequest({ html: "<p>test</p>", url: "" });
    expect(result.ok).toBe(false);
  });

  test("url が undefined の場合は ok: false", () => {
    const result = validateClipRequest({ html: "<p>test</p>", url: undefined });
    expect(result.ok).toBe(false);
  });

  test("ftp:// スキームの URL は ok: false", () => {
    const result = validateClipRequest({ html: "<p>test</p>", url: "ftp://example.com" });
    expect(result.ok).toBe(false);
  });

  test("http:// URL は ok: true", () => {
    const result = validateClipRequest({ html: "<p>test</p>", url: "http://example.com" });
    expect(result.ok).toBe(true);
  });

  test("https:// URL は ok: true", () => {
    const result = validateClipRequest({
      html: "<p>test</p>",
      url: "https://example.com/path?q=1",
    });
    expect(result.ok).toBe(true);
  });

  test("ok: false のとき error メッセージを含む", () => {
    const result = validateClipRequest({ html: "", url: "https://example.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
