import { describe, expect, it } from "vitest";
import type { Article, FeedArticleCommit, FeedArticleSnapshot, SharedFeedMeta } from "../types";
import {
  iterateFeedArticleBatches,
  mergeNewArticlesWithChanges,
  readArticlePage,
  readFeedArticleObject,
  readFeedArticleRevision,
  readFeedArticleSnapshot,
  readLatestArticles,
  repairFeedArticleMetadata,
} from "./shared-feed-storage";
import { MAX_PAGES, PAGE_SIZE } from "./shared-feed-constants";

const FEED = "0123456789abcdef";
const HEAD = `feeds/${FEED}/articles/latest.json`;
const META = `feeds/${FEED}/meta.json`;

function article(index: number, extra: Partial<Article> = {}): Article {
  return {
    id: `id-${String(index).padStart(8, "0")}`,
    feedHash: FEED,
    guid: `guid-${index}`,
    title: `Article ${index}`,
    link: `https://example.com/${index}`,
    summary: "",
    publishedAt: new Date(Date.UTC(2026, 8, 30) - index * 1000).toISOString(),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function metadata(): SharedFeedMeta {
  return {
    feedHash: FEED,
    url: "https://example.com/feed",
    title: "Example",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    articleCount: 0,
    pageCount: 0,
    knownIds: [],
  };
}

function fakeBucket() {
  const store = new Map<
    string,
    { body: string; etag: string; customMetadata?: Record<string, string> }
  >();
  const reads: string[] = [];
  const writes: string[] = [];
  let sequence = 0;
  let failPut: ((key: string) => boolean) | undefined;
  let beforeHeadPut: (() => Promise<void>) | undefined;
  function seed(key: string, value: unknown, customMetadata?: Record<string, string>) {
    store.set(key, { body: JSON.stringify(value), etag: String(++sequence), customMetadata });
  }
  const bucket = {
    get: async (key: string) => {
      reads.push(key);
      const value = store.get(key);
      return value ? { etag: value.etag, json: async () => JSON.parse(value.body) } : null;
    },
    head: async (key: string) => {
      const value = store.get(key);
      return value ? { etag: value.etag, customMetadata: value.customMetadata } : null;
    },
    put: async (key: string, body: string, options?: R2PutOptions) => {
      writes.push(key);
      if (failPut?.(key)) throw new Error("Injected PUT failure");
      if (key === HEAD && beforeHeadPut) {
        const hook = beforeHeadPut;
        beforeHeadPut = undefined;
        await hook();
      }
      const condition = options?.onlyIf;
      if (condition instanceof Headers) {
        if (condition.get("If-None-Match") === "*" && store.has(key)) return null;
      } else if (condition?.etagMatches && condition.etagMatches !== store.get(key)?.etag) {
        return null;
      }
      const etag = String(++sequence);
      store.set(key, { body, etag, customMetadata: options?.customMetadata });
      return { etag };
    },
  } as unknown as R2Bucket;
  return {
    bucket,
    store,
    reads,
    writes,
    seed,
    fail: (predicate: (key: string) => boolean) => {
      failPut = predicate;
    },
    beforeHeadPut: (hook: () => Promise<void>) => {
      beforeHeadPut = hook;
    },
  };
}

async function allArticles(bucket: R2Bucket): Promise<Article[]> {
  const snapshot = await readFeedArticleSnapshot(bucket, FEED);
  const articles: Article[] = [];
  for await (const batch of iterateFeedArticleBatches(bucket, FEED, snapshot))
    articles.push(...batch.articles);
  return articles;
}

async function commit(bucket: R2Bucket, meta: SharedFeedMeta, fetched: Article[]) {
  return mergeNewArticlesWithChanges(bucket, meta, fetched, await readLatestArticles(bucket, FEED));
}

describe("append-oriented shared feed storage", () => {
  it("preserves 500-item newest-first logical pages without cascading historical writes", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    const original = Array.from({ length: PAGE_SIZE * 8 }, (_, i) => article(i));
    await commit(mock.bucket, meta, original);
    const previous = await readFeedArticleSnapshot(mock.bucket, FEED);
    mock.writes.length = 0;
    const result = await commit(mock.bucket, meta, [article(-1)]);
    expect(result.newArticles).toHaveLength(1);
    expect(mock.writes).toHaveLength(2); // one immutable overflow + one head
    expect(mock.writes.at(-1)).toBe(HEAD);
    expect(mock.writes.some((key) => previous.segments.some((s) => s.objectKey === key))).toBe(
      false,
    );
    expect(await readLatestArticles(mock.bucket, FEED)).toHaveLength(PAGE_SIZE);
    expect((await readArticlePage(mock.bucket, FEED, 2)).map((a) => a.id)).toEqual(
      original.slice(PAGE_SIZE - 1, PAGE_SIZE * 2 - 1).map((a) => a.id),
    );
    expect(meta.pageCount).toBe(8);
    expect(new Set((await allArticles(mock.bucket)).map((a) => a.id)).size).toBe(4001);
  });

  it("coalesces a partial archive head, leaving full immutable objects untouched", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 1200 }, (_, i) => article(i)),
    );
    const old = await readFeedArticleSnapshot(mock.bucket, FEED);
    mock.writes.length = 0;
    const result = await commit(mock.bucket, meta, [article(-1), article(-2)]);
    expect(mock.writes).toHaveLength(2);
    const full = old.segments.find((s) => s.count === PAGE_SIZE)!;
    expect((await readFeedArticleSnapshot(mock.bucket, FEED)).segments).toContainEqual(full);
    expect(result.commit?.removedObjectKeys).toEqual([
      old.segments.find((s) => s.count < PAGE_SIZE)!.objectKey,
    ]);
    expect(await allArticles(mock.bucket)).toHaveLength(1202);
  });

  it("handles 499/500/501 and simultaneous duplicate IDs and content updates", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 499 }, (_, i) => article(i)),
    );
    expect(meta.pageCount).toBe(0);
    await commit(mock.bucket, meta, [article(499)]);
    expect(meta.pageCount).toBe(0);
    const result = await commit(mock.bucket, meta, [
      article(0, { title: "Updated", createdAt: "2099-01-01" }),
      article(500),
      article(500, { title: "Last occurrence" }),
    ]);
    expect(result.newArticles).toHaveLength(1);
    expect(meta.articleCount).toBe(501);
    expect(meta.pageCount).toBe(1);
    const all = await allArticles(mock.bucket);
    expect(all.find((a) => a.id === article(0).id)).toMatchObject({
      title: "Updated",
      createdAt: article(0).createdAt,
    });
    expect(all.find((a) => a.id === article(500).id)?.title).toBe("Last occurrence");
  });

  it("deduplicates and updates an archived ID even when it has fallen out of knownIds", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 1001 }, (_, i) => article(i)),
    );
    meta.knownIds = [];
    const changed = article(900, { title: "Archive correction", createdAt: "2099-01-01" });
    const result = await commit(mock.bucket, meta, [changed, article(-1)]);
    expect(result.newArticles).toHaveLength(1);
    const all = await allArticles(mock.bucket);
    expect(all.filter((a) => a.id === changed.id)).toHaveLength(1);
    expect(all.find((a) => a.id === changed.id)).toMatchObject({
      title: changed.title,
      createdAt: article(900).createdAt,
    });
    expect(all).toHaveLength(1002);
  });

  it("preserves omitted optional RSS fields on archived refetch without an unnecessary commit", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    const original = article(550, {
      author: "Author",
      ogImage: "https://example.com/image.jpg",
      categories: ["Tech"],
      metadata: [{ key: "source", value: "Archive" }],
      content: "Existing content",
    });
    const articles = Array.from({ length: 600 }, (_, i) => (i === 550 ? original : article(i)));
    await commit(mock.bucket, meta, articles);
    mock.writes.length = 0;
    const omitted = {
      ...original,
      author: undefined,
      ogImage: undefined,
      categories: undefined,
      metadata: undefined,
      content: undefined,
      createdAt: "2099-01-01",
    };
    expect(await commit(mock.bucket, meta, [omitted])).toEqual({ newArticles: [] });
    expect(mock.writes).toEqual([]);
    await commit(mock.bucket, meta, [{ ...omitted, title: "Corrected" }]);
    expect((await allArticles(mock.bucket)).find((a) => a.id === original.id)).toEqual({
      ...original,
      title: "Corrected",
    });
  });

  it("repairs stale article metadata using only HEAD after a commit and failed metadata write", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 501 }, (_, i) => article(i)),
    );
    const stale = metadata();
    mock.reads.length = 0;
    await repairFeedArticleMetadata(mock.bucket, stale);
    expect(stale).toMatchObject({
      articleCount: 501,
      pageCount: 1,
      articleRevision: meta.articleRevision,
    });
    expect(mock.reads).toEqual([]);
  });

  it("performs no PUT for an unchanged response", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    const fetched = Array.from({ length: 600 }, (_, i) => article(i));
    await commit(mock.bucket, meta, fetched);
    mock.writes.length = 0;
    const result = await commit(
      mock.bucket,
      meta,
      fetched.map((a) => ({ ...a, createdAt: "2099-01-01" })),
    );
    expect(result).toEqual({ newArticles: [] });
    expect(mock.writes).toEqual([]);
  });

  it("keeps globally sorted pages for backdated arrivals and date-changing edits", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 1600 }, (_, i) => article(i)),
    );
    await commit(mock.bucket, meta, [
      article(2000),
      article(0, { publishedAt: article(3000).publishedAt }),
    ]);
    const expected = (await allArticles(mock.bucket)).sort((a, b) => {
      const ad = a.publishedAt ?? a.createdAt;
      const bd = b.publishedAt ?? b.createdAt;
      return bd.localeCompare(ad) || a.id.localeCompare(b.id);
    });
    const pages = [];
    for (let page = 1; page <= meta.pageCount + 1; page++)
      pages.push(...(await readArticlePage(mock.bucket, FEED, page)));
    expect(pages.map((a) => a.id)).toEqual(expected.map((a) => a.id));
    expect(pages[0].id).toBe(article(1).id);
  });

  it("reads legacy pages through the final historical page, then lazily migrates without changing old objects", async () => {
    const mock = fakeBucket();
    const meta = { ...metadata(), articleCount: 1001, pageCount: 2 };
    mock.seed(META, meta);
    mock.seed(
      HEAD,
      Array.from({ length: 500 }, (_, i) => article(i)),
    );
    mock.seed(
      `feeds/${FEED}/articles/p2.json`,
      Array.from({ length: 500 }, (_, i) => article(i + 500)),
    );
    mock.seed(`feeds/${FEED}/articles/p3.json`, [article(1000)]);
    expect(await readArticlePage(mock.bucket, FEED, 3)).toHaveLength(1);
    expect(await allArticles(mock.bucket)).toHaveLength(1001);
    const p2 = mock.store.get(`feeds/${FEED}/articles/p2.json`);
    const result = await commit(mock.bucket, meta, [article(-1)]);
    expect(result.commit?.requiresRebuild).toBe(true);
    expect(mock.store.get(`feeds/${FEED}/articles/p2.json`)).toBe(p2);
    expect(await allArticles(mock.bucket)).toHaveLength(1002);
    expect((await readFeedArticleSnapshot(mock.bucket, FEED)).legacy).toBe(false);
  });

  it("splits an oversized legacy archive and removes cross-page duplicates without losing articles", async () => {
    const mock = fakeBucket();
    const meta = { ...metadata(), articleCount: 1202, pageCount: 1 };
    const original = Array.from({ length: 1201 }, (_, i) => article(i));
    mock.seed(HEAD, original.slice(0, 500));
    mock.seed(`feeds/${FEED}/articles/p2.json`, [article(0), ...original.slice(500)]);
    await commit(mock.bucket, meta, [article(-1), article(900, { title: "Corrected legacy" })]);
    const all = await allArticles(mock.bucket);
    expect(all).toHaveLength(1202);
    expect(new Set(all.map((a) => a.id)).size).toBe(1202);
    expect(all.find((a) => a.id === article(900).id)?.title).toBe("Corrected legacy");
    const snapshot = await readFeedArticleSnapshot(mock.bucket, FEED);
    expect(snapshot.segments.every((segment) => segment.count <= PAGE_SIZE)).toBe(true);
  });

  it("persists an unchanged legacy archive migration once rather than rescanning every refresh", async () => {
    const mock = fakeBucket();
    const articles = Array.from({ length: 1000 }, (_, i) => article(i));
    const meta = {
      ...metadata(),
      articleCount: 1000,
      pageCount: 1,
      knownIds: articles.map((a) => a.id),
    };
    mock.seed(HEAD, articles.slice(0, 500));
    mock.seed(`feeds/${FEED}/articles/p2.json`, articles.slice(500));
    const first = await commit(mock.bucket, meta, articles);
    expect(first.newArticles).toEqual([]);
    expect(first.commit?.requiresRebuild).toBe(true);
    expect(mock.writes).toEqual([HEAD]);
    mock.writes.length = 0;
    expect(await commit(mock.bucket, meta, articles)).toEqual({ newArticles: [] });
    expect(mock.writes).toEqual([]);
  });

  it("retains the published snapshot on segment or head write failure and ignores orphan objects", async () => {
    for (const failure of ["segment", "head"]) {
      const mock = fakeBucket();
      const meta = metadata();
      await commit(
        mock.bucket,
        meta,
        Array.from({ length: 500 }, (_, i) => article(i)),
      );
      const before = mock.store.get(HEAD)!.body;
      const revision = meta.articleRevision;
      mock.fail((key) => (failure === "head" ? key === HEAD : key.includes("/segments/")));
      await expect(commit(mock.bucket, meta, [article(-1)])).rejects.toThrow(
        "Injected PUT failure",
      );
      expect(mock.store.get(HEAD)!.body).toBe(before);
      expect(meta.articleRevision).toBe(revision);
      expect(await allArticles(mock.bucket)).toHaveLength(500);
    }
  });

  it("retries a CAS conflict against the winner without dropping either writer's articles", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 500 }, (_, i) => article(i)),
    );
    mock.beforeHeadPut(async () => {
      await commit(mock.bucket, { ...meta }, [article(-2)]);
    });
    await commit(mock.bucket, meta, [article(-1)]);
    const all = await allArticles(mock.bucket);
    expect(all).toHaveLength(502);
    expect(all.map((a) => a.id)).toContain(article(-1).id);
    expect(all.map((a) => a.id)).toContain(article(-2).id);
  });

  it("keeps stable physical priorities and exports only committed changed objects for indexing", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 1200 }, (_, i) => article(i)),
    );
    const old = await readFeedArticleSnapshot(mock.bucket, FEED);
    const result = await commit(mock.bucket, meta, [article(-1)]);
    const change: FeedArticleCommit = result.commit!;
    const next = await readFeedArticleSnapshot(mock.bucket, FEED);
    expect(await readFeedArticleRevision(mock.bucket, FEED)).toBe(change.revision);
    expect(change.previousRevision).toBe(old.revision);
    expect(change.revision).toBe(meta.articleRevision);
    for (const segment of next.segments) {
      const previous = old.segments.find((s) => s.objectKey === segment.objectKey);
      if (previous) expect(segment.priority).toBe(previous.priority);
    }
    for (const batch of change.changedObjects) {
      const object = await readFeedArticleObject(mock.bucket, FEED, batch.objectKey);
      expect(object?.articles).toEqual(batch.articles);
      if (batch.objectKey === HEAD) expect(object?.revision).toBe(change.revision);
    }
    await expect(
      readFeedArticleObject(mock.bucket, FEED, "feeds/other/articles/latest.json"),
    ).rejects.toThrow();
  });

  it("fails closed on missing referenced objects during migration and index iteration", async () => {
    const mock = fakeBucket();
    const meta = { ...metadata(), articleCount: 501, pageCount: 1 };
    mock.seed(META, meta);
    mock.seed(
      HEAD,
      Array.from({ length: 500 }, (_, i) => article(i)),
    );
    await expect(commit(mock.bucket, meta, [article(-1)])).rejects.toThrow(
      "Missing article object",
    );
    await expect(allArticles(mock.bucket)).rejects.toThrow("Missing article object");
    expect(mock.writes).toHaveLength(0);
  });

  it("preserves MAX_PAGES overflow in the final logical page and skips disjoint runs by metadata", async () => {
    const mock = fakeBucket();
    const meta = metadata();
    // Create real bounded descriptors, then extend metadata with disjoint archive runs. Only the
    // final run needs an object: deep-page skip must not read all 498 preceding objects.
    await commit(
      mock.bucket,
      meta,
      Array.from({ length: 1000 }, (_, i) => article(i)),
    );
    const snapshot: FeedArticleSnapshot = await readFeedArticleSnapshot(mock.bucket, FEED);
    const template = snapshot.segments[0];
    const segments = Array.from({ length: MAX_PAGES - 1 }, (_, i) => {
      const start = (i + 1) * PAGE_SIZE;
      return {
        ...template,
        objectKey: `feeds/${FEED}/articles/segments/fixture-${i}.json`,
        priority: i + 2,
        newest: article(start),
        oldest: article(start + PAGE_SIZE - 1),
      };
    });
    const final = segments.at(-1)!;
    const finalArticles = Array.from({ length: PAGE_SIZE }, (_, i) =>
      article((MAX_PAGES - 1) * PAGE_SIZE + i),
    );
    mock.seed(final.objectKey, finalArticles);
    mock.seed(
      segments.at(-2)!.objectKey,
      Array.from({ length: PAGE_SIZE }, (_, i) => article((MAX_PAGES - 2) * PAGE_SIZE + i)),
    );
    mock.seed(
      HEAD,
      {
        version: 2,
        revision: "fixture",
        articles: snapshot.latest,
        segments,
        nextSegmentId: 2,
        knownIds: snapshot.latest.map((a) => a.id),
        articleLocations: {},
      },
      { articleRevision: "fixture" },
    );
    mock.reads.length = 0;
    mock.writes.length = 0;
    await commit(mock.bucket, meta, [article(-1)]);
    expect(mock.writes).toHaveLength(2);
    expect(mock.reads.every((key) => key === HEAD)).toBe(true);
    expect(meta.articleCount).toBe(MAX_PAGES * PAGE_SIZE + 1);
    expect(meta.pageCount).toBe(MAX_PAGES - 1);
    expect(meta.oversizeAlert).toBe(true);
    mock.reads.length = 0;
    const lastPage = await readArticlePage(mock.bucket, FEED, MAX_PAGES);
    expect(lastPage).toHaveLength(PAGE_SIZE + 1);
    expect(lastPage.at(-1)?.id).toBe(finalArticles.at(-1)?.id);
    expect(mock.reads.length).toBeLessThanOrEqual(4);
  });
});

it("distinguishes a truly empty feed from a missing populated head during index readiness checks", async () => {
  const mock = fakeBucket();
  await expect(readFeedArticleRevision(mock.bucket, FEED, metadata())).resolves.toBe(
    "legacy:missing",
  );
  await expect(
    readFeedArticleRevision(mock.bucket, FEED, { ...metadata(), articleCount: 1 }),
  ).rejects.toThrow("Missing latest article object");
});
