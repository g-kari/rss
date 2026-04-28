import { test, expect } from "@playwright/test";
import { buildCacheKey, buildJsonCacheResponse } from "../src/lib/cache-helper";
import { buildClipCacheKey, buildContentCacheKey } from "../src/lib/fetch-article-content";

/**
 * cache-helper の単体テスト。
 *
 * - buildCacheKey は `/__cache/{type}/{sha256(normalizedUrl)}` 形式のキー生成
 * - buildJsonCacheResponse は JSON + Cache-Control ヘッダー付き Response 構築
 *
 * matchCfCache / cachePutAsync は caches.default に依存するため
 * Workers ランタイム上の E2E でカバーする（ユニット対象外）。
 */

test.describe("buildCacheKey", () => {
  test("合成 URL は /__cache/{type}/{hash} の形式", async () => {
    const req = await buildCacheKey("https://rss.0g0.xyz", "content", "https://example.com/a");
    const u = new URL(req.url);
    expect(u.origin).toBe("https://rss.0g0.xyz");
    expect(u.pathname.startsWith("/__cache/content/")).toBe(true);
    const hash = u.pathname.split("/").pop()!;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("type ごとに異なる名前空間を生成する", async () => {
    const a = await buildCacheKey("https://rss.0g0.xyz", "content", "https://example.com/");
    const b = await buildCacheKey("https://rss.0g0.xyz", "ogp", "https://example.com/");
    expect(a.url).not.toBe(b.url);
  });

  test("同じ URL は同じキーを生成する（決定論）", async () => {
    const a = await buildCacheKey("https://rss.0g0.xyz", "content", "https://example.com/");
    const b = await buildCacheKey("https://rss.0g0.xyz", "content", "https://example.com/");
    expect(a.url).toBe(b.url);
  });
});

test.describe("buildClipCacheKey — ユーザースコープ clip キャッシュ", () => {
  test("clip キャッシュキーは共有コンテンツキャッシュと異なる", async () => {
    const url = "https://example.com/article";
    const origin = "https://rss.0g0.xyz";
    const contentKey = await buildContentCacheKey(origin, url);
    const clipKey = await buildClipCacheKey(origin, "user-1", url);
    expect(clipKey.url).not.toBe(contentKey.url);
  });

  test("異なるユーザーは異なる clip キャッシュキーを生成する", async () => {
    const url = "https://example.com/article";
    const origin = "https://rss.0g0.xyz";
    const a = await buildClipCacheKey(origin, "user-1", url);
    const b = await buildClipCacheKey(origin, "user-2", url);
    expect(a.url).not.toBe(b.url);
  });

  test("同じユーザー・URL は同じキーを生成する", async () => {
    const url = "https://example.com/article";
    const origin = "https://rss.0g0.xyz";
    const a = await buildClipCacheKey(origin, "user-1", url);
    const b = await buildClipCacheKey(origin, "user-1", url);
    expect(a.url).toBe(b.url);
  });

  test("clip キャッシュキーの pathname に clip/{userId} を含む", async () => {
    const req = await buildClipCacheKey("https://rss.0g0.xyz", "u123", "https://example.com/");
    const u = new URL(req.url);
    expect(u.pathname.startsWith("/__cache/clip/u123/")).toBe(true);
  });
});

test.describe("buildJsonCacheResponse", () => {
  test("Content-Type と Cache-Control を設定する", () => {
    const res = buildJsonCacheResponse({ foo: "bar" }, 3600);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  test("ペイロードを JSON シリアライズしてボディに書く", async () => {
    const res = buildJsonCacheResponse({ content: "hello" }, 60);
    const parsed = await res.json();
    expect(parsed).toEqual({ content: "hello" });
  });

  test("TTL を可変に反映する", () => {
    const res = buildJsonCacheResponse({}, 7 * 24 * 60 * 60);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=604800");
  });
});
