import { test, expect } from "@playwright/test";
import { validateClipRequest, clipCacheKey } from "../src/lib/clip";

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

// ===== clipCacheKey =====

test.describe("clipCacheKey — キャッシュキー生成", () => {
  test("/api/content と同じ /__cache/content/ プレフィックスを持つ", async () => {
    const key = await clipCacheKey("https://rss.example.com", "https://target.example.com/article");
    expect(key).toContain("/__cache/content/");
  });

  test("origin を含む完全な URL を返す", async () => {
    const key = await clipCacheKey("https://rss.example.com", "https://target.example.com/article");
    expect(key.startsWith("https://rss.example.com")).toBe(true);
  });

  test("同じ origin + url なら同じキーを返す", async () => {
    const url = "https://target.example.com/article";
    const origin = "https://rss.example.com";
    const key1 = await clipCacheKey(origin, url);
    const key2 = await clipCacheKey(origin, url);
    expect(key1).toBe(key2);
  });

  test("異なる url は異なるキーを返す", async () => {
    const origin = "https://rss.example.com";
    const key1 = await clipCacheKey(origin, "https://target.example.com/article/1");
    const key2 = await clipCacheKey(origin, "https://target.example.com/article/2");
    expect(key1).not.toBe(key2);
  });
});
