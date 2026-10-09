import { describe, expect, it } from "vitest";
import type { Article, ReadState, SharedFeedMeta, UserSubscription } from "../types";
import { compareByDateDesc } from "./article-utils";
import { compileSearchQuery } from "./full-text-search";
import { searchLegacyArticles } from "./legacy-article-search";

const FIRST = "0123456789abcdef";
const SECOND = "fedcba9876543210";
const readState: ReadState = { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] };
function article(id: string, extra: Partial<Article> = {}): Article {
  return {
    id,
    feedHash: FIRST,
    guid: id,
    title: `東京 match ${id}`,
    link: `https://example.com/${id}`,
    summary: "red fox",
    content: "<p>日本語 &amp; node.js</p>",
    publishedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}
function subscription(feedHash: string, customTitle = ""): UserSubscription {
  return {
    feedHash,
    customTitle,
    url: "https://example.com/feed",
    subscribedAt: "2026-01-01T00:00:00Z",
  };
}
function fixture() {
  const store = new Map<string, unknown>();
  const reads: string[] = [];
  let active = 0;
  let peak = 0;
  const bucket = {
    head: async (key: string) => {
      if (!store.has(key)) return null;
      return { etag: key };
    },
    get: async (key: string) => {
      reads.push(key);
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, key.includes("p2") ? 5 : 1));
      if (!store.has(key)) {
        active--;
        return null;
      }
      return {
        etag: key,
        json: async () => {
          active--;
          return structuredClone(store.get(key));
        },
      };
    },
  } as unknown as R2Bucket;
  function feed(hash: string, latest: Article[], archives: Article[][], v2 = false) {
    const meta: SharedFeedMeta = {
      feedHash: hash,
      url: `https://example.com/${hash}`,
      title: `Original ${hash}`,
      siteUrl: "https://example.com",
      lastFetchedAt: null,
      fetchError: null,
      articleCount: latest.length + archives.flat().length,
      pageCount: archives.length,
      knownIds: [],
    };
    store.set(`feeds/${hash}/meta.json`, meta);
    const segments = archives.map((rows, index) => {
      const objectKey = `feeds/${hash}/articles/${v2 ? `segments/${index}.json` : `p${index + 2}.json`}`;
      store.set(objectKey, rows);
      return {
        objectKey,
        count: rows.length,
        priority: v2 ? index - archives.length : index + 2,
        newest: rows[0],
        oldest: rows.at(-1),
      };
    });
    store.set(
      `feeds/${hash}/articles/latest.json`,
      v2
        ? {
            version: 2,
            revision: "revision",
            articles: latest,
            segments: [...segments].reverse(),
            nextSegmentId: 10,
            knownIds: [],
            articleLocations: {},
          }
        : latest,
    );
  }
  return { bucket, store, reads, feed, peak: () => peak };
}

describe("legacy rollout article search", () => {
  it("matches the original exact evaluator across both physical layouts and custom context", async () => {
    const mock = fixture();
    const saved = [article("saved", { title: "Saved 東京", publishedAt: null })];
    const latest = [article("one"), article("duplicate", { title: "first copy" })];
    const archives = [
      [article("two", { author: "Alice", categories: ["science"] })],
      [article("duplicate", { title: "match ignored duplicate" }), article("three")],
    ];
    mock.feed(FIRST, latest, archives);
    const other = [article("four", { feedHash: SECOND, title: "elephant" })];
    mock.feed(SECOND, [], [other], true);
    const subscriptions = [subscription(FIRST, "My custom 日本語"), subscription(SECOND)];
    const state = { ...readState, tagIds: { two: ["favorite"] }, ttlDays: 1 };
    subscriptions[0].filter = { include: ["never matches"], exclude: [] };
    const context = {
      feedTitleByHash: new Map([
        [FIRST, "My custom 日本語"],
        [SECOND, `Original ${SECOND}`],
      ]),
      tagsByArticleId: state.tagIds,
    };
    const unique = [
      ...new Map(
        [...saved, ...latest, ...archives.flat(), ...other].reverse().map((a) => [a.id, a]),
      ).values(),
    ];
    for (const query of [
      "東京",
      "日本",
      '"red fox"',
      "node.js",
      "title:東京 OR author:Alice",
      "match -title:three",
      "feed:custom",
      "tag:favorite",
      "category:science",
      "published:2026",
      "NOT elephant",
    ]) {
      const expected = unique
        .filter((a) => compileSearchQuery(query)?.(a, context))
        .sort(compareByDateDesc);
      expect(
        await searchLegacyArticles({
          bucket: mock.bucket,
          query,
          subscriptions,
          savedArticles: saved,
          readState: state,
        }),
      ).toEqual(expected);
    }
    expect(mock.reads).toContain(`feeds/${FIRST}/articles/p3.json`);
    expect(mock.reads).toContain(`feeds/${SECOND}/articles/segments/0.json`);
  });

  it("deduplicates before matching in saved, subscription and physical-priority order", async () => {
    const mock = fixture();
    mock.feed(
      FIRST,
      [article("saved-id"), article("shared", { title: "excluded" })],
      [[article("physical", { title: "excluded" })], [article("physical"), article("shared")]],
      true,
    );
    mock.feed(
      SECOND,
      [article("shared", { feedHash: SECOND }), article("unique", { feedHash: SECOND })],
      [],
    );
    const result = await searchLegacyArticles({
      bucket: mock.bucket,
      query: "match",
      subscriptions: [subscription(FIRST), subscription(SECOND)],
      savedArticles: [article("saved-id", { title: "excluded" }), article("saved-id")],
      readState,
    });
    expect(result.map((a) => a.id)).toEqual(["unique"]);
  });

  it("keeps globally bounded body reads and the same top K as full sort", async () => {
    const mock = fixture();
    const articles = Array.from({ length: 100 }, (_, i) =>
      article(String(i).padStart(3, "0"), {
        publishedAt: i % 3 ? `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z` : null,
        createdAt: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    mock.feed(
      FIRST,
      articles.slice(0, 10),
      Array.from({ length: 9 }, (_, i) => articles.slice(10 + i * 10, 20 + i * 10)),
      true,
    );
    const result = await searchLegacyArticles({
      bucket: mock.bucket,
      query: "match",
      subscriptions: [subscription(FIRST)],
      savedArticles: [],
      readState,
      limit: 7,
    });
    expect(result).toEqual([...articles].sort(compareByDateDesc).slice(0, 7));
    expect(mock.peak()).toBeLessThanOrEqual(4);
    expect(mock.peak()).toBeGreaterThan(1);
    expect(new Set(mock.reads).size).toBe(mock.reads.length);
  });

  it("returns empty invalid queries without reads and handles absent subscriptions", async () => {
    const mock = fixture();
    const options = {
      bucket: mock.bucket,
      subscriptions: [subscription(FIRST)],
      savedArticles: [],
      readState,
    };
    for (const query of ["", "OR -"])
      expect(await searchLegacyArticles({ ...options, query })).toEqual([]);
    expect(mock.reads).toEqual([]);
    expect(await searchLegacyArticles({ ...options, query: "match" })).toEqual([]);
  });

  it("fails on missing referenced archives instead of silently omitting results", async () => {
    const mock = fixture();
    mock.feed(FIRST, [], [[article("lost")]], true);
    mock.store.delete(`feeds/${FIRST}/articles/segments/0.json`);
    await expect(
      searchLegacyArticles({
        bucket: mock.bucket,
        query: "match",
        subscriptions: [subscription(FIRST)],
        savedArticles: [],
        readState,
      }),
    ).rejects.toThrow("Missing article object");
  });
});
