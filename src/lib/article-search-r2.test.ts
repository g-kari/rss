import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, ReadState, SharedFeedMeta } from "../types";
import {
  ensureFeedR2SearchIndex,
  feedSearchManifestKey,
  rebuildFeedR2SearchIndex,
  upsertFeedR2SearchIndex,
  type FeedR2SearchManifest,
} from "./article-search-r2";
import { searchLegacyArticles } from "./legacy-article-search";
import { mergeNewArticlesWithChanges } from "./shared-feed-storage";

const FEED = "0123456789abcdef";
const HEAD = `feeds/${FEED}/articles/latest.json`;
const META = `feeds/${FEED}/meta.json`;
const readState: ReadState = { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] };

function article(index: number, extra: Partial<Article> = {}): Article {
  return {
    id: `id-${index}`,
    feedHash: FEED,
    guid: `guid-${index}`,
    title: `Title ${index}`,
    link: `https://example.com/${index}`,
    summary: index === 7 ? "unique needle" : "summary",
    publishedAt: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function bucket() {
  const store = new Map<string, { body: string; etag: string }>();
  const reads: string[] = [];
  const writes: string[] = [];
  let sequence = 0;
  let failPut: (key: string) => boolean = () => false;
  const api = {
    head: async (key: string) => {
      reads.push(`head:${key}`);
      const value = store.get(key);
      return value ? { etag: value.etag } : null;
    },
    get: async (key: string) => {
      reads.push(key);
      const value = store.get(key);
      if (!value) return null;
      return { etag: value.etag, json: async () => JSON.parse(value.body) };
    },
    put: async (key: string, body: string) => {
      writes.push(key);
      if (failPut(key)) throw new Error("Injected PUT failure");
      const etag = String(++sequence);
      store.set(key, { body, etag });
      return { etag };
    },
  } as unknown as R2Bucket;
  return {
    api,
    store,
    reads,
    writes,
    seed(key: string, value: unknown) {
      store.set(key, { body: JSON.stringify(value), etag: String(++sequence) });
    },
    fail(predicate: (key: string) => boolean) {
      failPut = predicate;
    },
  };
}

function seedHistory(mock: ReturnType<typeof bucket>, pages: number) {
  const latest = Array.from({ length: 10 }, (_, index) => article(index));
  const archives = Array.from({ length: pages }, (_, page) =>
    Array.from({ length: 10 }, (_, index) => article(100 + page * 10 + index)),
  );
  const meta: SharedFeedMeta = {
    feedHash: FEED,
    url: "https://example.com/feed",
    title: "Example",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    articleCount: latest.length + archives.flat().length,
    pageCount: pages,
    knownIds: latest.map((item) => item.id),
  };
  mock.seed(META, meta);
  mock.seed(HEAD, latest);
  archives.forEach((rows, index) => {
    mock.seed(`feeds/${FEED}/articles/p${index + 2}.json`, rows);
  });
  return { meta, latest, archives };
}

describe("R2 article search index", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("searches a multi-page feed without reading article pages once the index is ready", async () => {
    const mock = bucket();
    const { meta, latest, archives } = seedHistory(mock, 8);
    await rebuildFeedR2SearchIndex(mock.api, FEED, meta);
    mock.reads.length = 0;
    const result = await searchLegacyArticles({
      bucket: mock.api,
      query: "needle",
      subscriptions: [
        {
          feedHash: FEED,
          url: meta.url,
          subscribedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      savedArticles: [],
      readState,
    });
    expect(result.map((item) => item.id)).toEqual(["id-7"]);
    const bodyReads = mock.reads.filter((key) => !key.startsWith("head:"));
    expect(bodyReads.some((key) => key.includes("/articles/p"))).toBe(false);
    expect(bodyReads.some((key) => key.endsWith("/articles/latest.json"))).toBe(false);
    expect(mock.reads).toContain(feedSearchManifestKey(FEED));
    expect(mock.reads.some((key) => key.includes("/search/docs/"))).toBe(true);
    expect(mock.reads.filter((key) => key.startsWith("head:")).length).toBeGreaterThan(0);
    expect(latest.length + archives.flat().length).toBeGreaterThan(result.length);
  });

  it("keeps saved-article precedence and date order from the index", async () => {
    const mock = bucket();
    const { meta } = seedHistory(mock, 2);
    await rebuildFeedR2SearchIndex(mock.api, FEED, meta);
    const saved = article(7, { title: "saved copy", summary: "unique needle", id: "id-7" });
    const result = await searchLegacyArticles({
      bucket: mock.api,
      query: "needle",
      subscriptions: [{ feedHash: FEED, url: meta.url, subscribedAt: "2026-01-01T00:00:00.000Z" }],
      savedArticles: [saved],
      readState,
    });
    expect(result).toEqual([saved]);
  });

  it("updates a ready index without rereading history pages", async () => {
    const mock = bucket();
    const { meta } = seedHistory(mock, 4);
    await rebuildFeedR2SearchIndex(mock.api, FEED, meta);
    const manifest = JSON.parse(
      mock.store.get(feedSearchManifestKey(FEED))!.body,
    ) as FeedR2SearchManifest;
    const previous = manifest.sourceRevision;
    const updated = article(120, { title: "retitled needle" });
    mock.reads.length = 0;
    mock.writes.length = 0;
    expect(await upsertFeedR2SearchIndex(mock.api, FEED, previous, "legacy:next", [updated])).toBe(
      true,
    );
    expect(mock.reads.some((key) => key.includes("/articles/p"))).toBe(false);
    expect(mock.writes.every((key) => key.includes("/search/"))).toBe(true);
    mock.store.get(HEAD)!.etag = "next";
    mock.reads.length = 0;
    const result = await searchLegacyArticles({
      bucket: mock.api,
      query: "retitled",
      subscriptions: [{ feedHash: FEED, url: meta.url, subscribedAt: "2026-01-01T00:00:00.000Z" }],
      savedArticles: [],
      readState,
    });
    expect(result.map((item) => item.id)).toEqual(["id-120"]);
    expect(mock.reads.some((key) => key.includes("/articles/p"))).toBe(false);
  });

  it("falls back to article pages when the index revision is stale", async () => {
    const mock = bucket();
    const { meta } = seedHistory(mock, 1);
    await rebuildFeedR2SearchIndex(mock.api, FEED, meta);
    mock.store.get(HEAD)!.etag = "moved";
    mock.reads.length = 0;
    const result = await searchLegacyArticles({
      bucket: mock.api,
      query: "needle",
      subscriptions: [{ feedHash: FEED, url: meta.url, subscribedAt: "2026-01-01T00:00:00.000Z" }],
      savedArticles: [],
      readState,
    });
    expect(result.map((item) => item.id)).toEqual(["id-7"]);
    expect(mock.reads.some((key) => key.endsWith("/articles/latest.json"))).toBe(true);
  });

  it("keeps committed articles when the index write fails", async () => {
    const mock = bucket();
    const original = article(0);
    const meta: SharedFeedMeta = {
      feedHash: FEED,
      url: "https://example.com/feed",
      title: "Example",
      siteUrl: "https://example.com",
      lastFetchedAt: null,
      fetchError: null,
      articleCount: 1,
      pageCount: 0,
      knownIds: [original.id],
    };
    mock.seed(META, meta);
    mock.seed(HEAD, [original]);
    await ensureFeedR2SearchIndex(mock.api, FEED, meta);
    const beforePages = mock.store.get(HEAD)!.body;
    mock.fail((key) => key.includes("/search/docs/"));
    const updated = { ...original, title: "Updated needle" };
    const result = await mergeNewArticlesWithChanges(mock.api, meta, [updated], [], {
      allowLegacyMigration: false,
      maintainSearchIndex: true,
    });
    expect(result.newArticles).toEqual([]);
    expect(JSON.parse(mock.store.get(HEAD)!.body)).toEqual([updated]);
    expect(mock.store.get(HEAD)!.body).not.toBe(beforePages);
    expect(meta.fetchError).toBeNull();
    const found = await searchLegacyArticles({
      bucket: mock.api,
      query: "Updated",
      subscriptions: [{ feedHash: FEED, url: meta.url, subscribedAt: "2026-01-01T00:00:00.000Z" }],
      savedArticles: [],
      readState,
    });
    expect(found.map((item) => item.title)).toEqual(["Updated needle"]);
  });

  it("backfills pending spill, sealed spill segments, and frozen legacy pages", async () => {
    const mock = bucket();
    const latest = article(1, { id: "latest", summary: "latestneedle" });
    const pending = article(2, { id: "pending", summary: "pendingneedle" });
    const sealed = article(3, { id: "sealed", summary: "sealedneedle" });
    const legacy = article(4, { id: "legacy", summary: "legacyneedle" });
    const spillKey = `feeds/${FEED}/articles/segments/spill-0.json`;
    const meta: SharedFeedMeta = {
      feedHash: FEED,
      url: "https://example.com/feed",
      title: "Example",
      siteUrl: "https://example.com",
      lastFetchedAt: null,
      fetchError: null,
      articleCount: 4,
      pageCount: 1,
      knownIds: [latest.id, pending.id, sealed.id, legacy.id],
    };
    mock.seed(META, meta);
    mock.seed(HEAD, [latest]);
    mock.seed(`feeds/${FEED}/articles/overflow-pending.json`, [pending]);
    mock.seed(spillKey, [sealed]);
    mock.seed(`feeds/${FEED}/articles/p2.json`, [legacy]);
    mock.seed(`feeds/${FEED}/articles/overflow-manifest.json`, {
      version: 1,
      pendingCount: 1,
      sealed: [{ objectKey: spillKey, count: 1 }],
      nextSeal: 1,
      legacyPageCount: 1,
      legacyTailCount: 1,
    });
    await ensureFeedR2SearchIndex(mock.api, FEED, meta);
    const manifest = JSON.parse(
      mock.store.get(feedSearchManifestKey(FEED))!.body,
    ) as FeedR2SearchManifest;
    const docs = JSON.parse(mock.store.get(manifest.objectKey)!.body) as Article[];
    expect(docs.map((item) => item.id)).toEqual(["latest", "pending", "sealed", "legacy"]);
    expect(mock.reads).toEqual(
      expect.arrayContaining([
        `feeds/${FEED}/articles/overflow-manifest.json`,
        `feeds/${FEED}/articles/overflow-pending.json`,
        spillKey,
        `feeds/${FEED}/articles/p2.json`,
      ]),
    );
    const subscriptions = [
      { feedHash: FEED, url: meta.url, subscribedAt: "2026-01-01T00:00:00.000Z" },
    ];
    for (const [query, id] of [
      ["pendingneedle", "pending"],
      ["sealedneedle", "sealed"],
      ["legacyneedle", "legacy"],
    ] as const) {
      const found = await searchLegacyArticles({
        bucket: mock.api,
        query,
        subscriptions,
        savedArticles: [],
        readState,
      });
      expect(found.map((item) => item.id)).toEqual([id]);
    }
  });
});
