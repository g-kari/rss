import { test, expect } from "@playwright/test";
import { pruneOldReadIds, computeEffectiveReadBeforeCutoff } from "../src/lib/read-state-prune";
import type { Article } from "../src/types";

/**
 * pruneOldReadIds の単体テスト。
 *
 * `readBeforeTimestamp` 以前の publishedAt を持つ既知記事の readId を
 * 物理削除する純粋関数。`isArticleRead` でその時点以前は一括既読扱いに
 * なるため、個別 ID を保持する必要がない（#635 A1）。
 */

const baseArticle = (overrides: Partial<Article>): Article => ({
  id: "x",
  feedHash: "abc123",
  guid: "g1",
  title: "t",
  link: "https://example.com/x",
  summary: "",
  publishedAt: "2024-06-01T00:00:00Z",
  createdAt: "2024-06-01T00:00:00Z",
  ...overrides,
});

test.describe("pruneOldReadIds", () => {
  test("readBeforeTimestamp が null なら何もしない", () => {
    const readIds = new Set(["a", "b"]);
    const result = pruneOldReadIds(readIds, [], null);
    expect(result).toBe(readIds);
  });

  test("readBeforeTimestamp が不正な文字列なら何もしない", () => {
    const readIds = new Set(["a", "b"]);
    const result = pruneOldReadIds(readIds, [], "not-a-date");
    expect(result).toBe(readIds);
  });

  test("readBeforeTimestamp より古い publishedAt の readId を削除する", () => {
    const articles = [
      baseArticle({ id: "old1", publishedAt: "2024-01-01T00:00:00Z" }),
      baseArticle({ id: "old2", publishedAt: "2024-02-01T00:00:00Z" }),
      baseArticle({ id: "new1", publishedAt: "2024-06-01T00:00:00Z" }),
    ];
    const readIds = new Set(["old1", "old2", "new1"]);
    const result = pruneOldReadIds(readIds, articles, "2024-03-01T00:00:00Z");
    expect(result.has("old1")).toBe(false);
    expect(result.has("old2")).toBe(false);
    expect(result.has("new1")).toBe(true);
  });

  test("readBeforeTimestamp と等しい publishedAt は削除しない（境界値）", () => {
    const articles = [baseArticle({ id: "a", publishedAt: "2024-03-01T00:00:00Z" })];
    const readIds = new Set(["a"]);
    const result = pruneOldReadIds(readIds, articles, "2024-03-01T00:00:00Z");
    expect(result.has("a")).toBe(true);
  });

  test("knownArticles に存在しない readId は保持する（メタデータ不明のため判定不能）", () => {
    const articles = [baseArticle({ id: "known1", publishedAt: "2024-01-01T00:00:00Z" })];
    const readIds = new Set(["known1", "unknown1"]);
    const result = pruneOldReadIds(readIds, articles, "2024-03-01T00:00:00Z");
    expect(result.has("known1")).toBe(false);
    expect(result.has("unknown1")).toBe(true);
  });

  test("publishedAt が null の記事は削除しない", () => {
    const articles = [baseArticle({ id: "nodate", publishedAt: null })];
    const readIds = new Set(["nodate"]);
    const result = pruneOldReadIds(readIds, articles, "2024-03-01T00:00:00Z");
    expect(result.has("nodate")).toBe(true);
  });

  test("削除対象がなければ元の Set インスタンスを返す（参照同一性で再レンダー抑制）", () => {
    const articles = [baseArticle({ id: "new", publishedAt: "2024-06-01T00:00:00Z" })];
    const readIds = new Set(["new"]);
    const result = pruneOldReadIds(readIds, articles, "2024-03-01T00:00:00Z");
    expect(result).toBe(readIds);
  });

  test("空の readIds は空のまま返す", () => {
    const readIds = new Set<string>();
    const result = pruneOldReadIds(readIds, [], "2024-03-01T00:00:00Z");
    expect(result.size).toBe(0);
  });

  test("複数件の prune でも正しく削除する", () => {
    const articles = Array.from({ length: 100 }, (_, i) =>
      baseArticle({
        id: `id${i}`,
        publishedAt: i < 50 ? "2024-01-01T00:00:00Z" : "2024-06-01T00:00:00Z",
      }),
    );
    const readIds = new Set(articles.map((a) => a.id));
    const result = pruneOldReadIds(readIds, articles, "2024-03-01T00:00:00Z");
    expect(result.size).toBe(50);
    expect(result.has("id0")).toBe(false);
    expect(result.has("id49")).toBe(false);
    expect(result.has("id50")).toBe(true);
    expect(result.has("id99")).toBe(true);
  });
});

// #635 設定可能化: ttlDays から自動的に readBeforeTimestamp の cutoff を算出
test.describe("computeEffectiveReadBeforeCutoff (#635 設定可能化)", () => {
  const NOW = Date.parse("2026-05-09T00:00:00Z");

  test("どちらも null → null", () => {
    expect(computeEffectiveReadBeforeCutoff(null, null, NOW)).toBe(null);
  });

  test("readBeforeTimestamp のみ → そのまま返す", () => {
    expect(computeEffectiveReadBeforeCutoff("2026-04-01T00:00:00Z", null, NOW)).toBe(
      "2026-04-01T00:00:00Z",
    );
  });

  test("ttlDays のみ → now - ttlDays 日 を ISO で返す", () => {
    const result = computeEffectiveReadBeforeCutoff(null, 30, NOW);
    expect(result).toBe(new Date(NOW - 30 * 86400000).toISOString());
  });

  test("両方ある場合は新しい時刻を採用 (積極的削除)", () => {
    // ttlDays=30 → 2026-04-09 / 手動=2026-05-01 → 手動の方が新しい
    const result = computeEffectiveReadBeforeCutoff("2026-05-01T00:00:00Z", 30, NOW);
    expect(result).toBe("2026-05-01T00:00:00Z");
  });

  test("両方ある場合: ttl の方が新しいなら ttl を採用", () => {
    // 手動=2026-01-01 / ttlDays=10 → 2026-04-29 → ttl の方が新しい
    const result = computeEffectiveReadBeforeCutoff("2026-01-01T00:00:00Z", 10, NOW);
    expect(result).toBe(new Date(NOW - 10 * 86400000).toISOString());
  });

  test("ttlDays=0 は無効扱い (null と同じ)", () => {
    expect(computeEffectiveReadBeforeCutoff(null, 0, NOW)).toBe(null);
  });

  test("ttlDays=180 で約半年前", () => {
    const result = computeEffectiveReadBeforeCutoff(null, 180, NOW);
    expect(result).toBe(new Date(NOW - 180 * 86400000).toISOString());
  });
});
