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

test.describe("buildContentCacheKey — バージョニング", () => {
  test("content キャッシュキーは v2 名前空間を含む（POP キャッシュ無効化用）", async () => {
    const req = await buildContentCacheKey("https://rss.0g0.xyz", "https://example.com/article");
    const u = new URL(req.url);
    expect(u.pathname.startsWith("/__cache/content/v2/")).toBe(true);
  });

  test("v2 キーは旧 v1 (`/__cache/content/{hash}`) と衝突しない", async () => {
    const url = "https://example.com/article";
    const origin = "https://rss.0g0.xyz";
    const v2 = await buildContentCacheKey(origin, url);
    const v1 = await buildCacheKey(origin, "content", url);
    expect(v2.url).not.toBe(v1.url);
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

  // #849 invariant: 共有化 (家族共有 / 招待リンク等) 拡張時の cross-user 漏洩を構造的に防ぐため、
  // userId が cache key の path 一部 (hash 入力でなく path セグメント) であることを invariant として固定する。
  // この invariant が破られると、共有化機能追加時に「user A の clip が user B に return される」漏洩が起こる。
  test("invariant: userId は cache key の path セグメントとして含まれる (hash 内に隠れない)", async () => {
    const url = "https://example.com/secret-article";
    const origin = "https://rss.0g0.xyz";
    const userId = "alice-789";
    const req = await buildClipCacheKey(origin, userId, url);
    const u = new URL(req.url);
    // userId が path に直接出現することを assert (hash 入力に紛れて消えていない)
    expect(u.pathname).toContain(`/clip/${userId}/`);
  });

  test("invariant: 異なる userId × 同一 URL のキー衝突は構造的に発生しない (N=10 拡張ケース)", async () => {
    const url = "https://example.com/article";
    const origin = "https://rss.0g0.xyz";
    const userIds = [
      "u1",
      "u2",
      "alice",
      "bob",
      "charlie",
      "user-with-dash",
      "user_with_underscore",
      "user.with.dot",
      "0123456789abcdef",
      "very-long-user-id-1234567890abcdefghijklmnopqrstuvwxyz",
    ];
    const keys = await Promise.all(userIds.map((uid) => buildClipCacheKey(origin, uid, url)));
    const urls = keys.map((req) => req.url);
    const unique = new Set(urls);
    // 全 userId で unique key (= 衝突 0 件) が生成されることを assert
    expect(unique.size).toBe(userIds.length);
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
