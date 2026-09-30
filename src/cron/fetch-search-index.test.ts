// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, FeedArticleCommit, SharedFeedMeta } from "../types";
import { createConcurrencyLimiter } from "../lib/concurrency";
import { ensureFeedSearchIndex } from "../lib/article-search-index";
import { mergeNewArticlesWithChanges, readFeedMeta, writeFeedMeta } from "../lib/shared-feed";
import { fetchAndUpdateSharedFeed } from "./fetch";

vi.mock("../lib/article-search-index", () => ({ ensureFeedSearchIndex: vi.fn() }));
vi.mock("../lib/shared-feed", () => ({
  readFeedMeta: vi.fn(),
  repairFeedArticleMetadata: vi.fn(async () => {}),
  readLatestArticles: vi.fn(async () => []),
  mergeNewArticlesWithChanges: vi.fn(),
  writeFeedMeta: vi.fn(),
  computeArticleId: vi.fn(async (_url: string, guid: string) => guid),
}));

const bucket = {} as R2Bucket;
const database = {} as D1Database;
const env = {
  RSS_DATA: bucket,
  ARTICLE_SEARCH: database,
  RSS_ARTICLE_STORAGE_V2: "true",
  RSS_ARTICLE_SEARCH_INDEX: "true",
  RATE_LIMIT: {} as KVNamespace,
  FINDME_RSS: {} as Fetcher,
};
const xml =
  "<rss><channel><title>Feed</title><link>https://example.com</link><item><guid>a</guid><title>New article</title><link>https://example.com/a</link></item></channel></rss>";
const article: Article = {
  id: "a",
  feedHash: "feed",
  guid: "a",
  title: "New article",
  link: "https://example.com/a",
  summary: "",
  publishedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
};
const commit: FeedArticleCommit = {
  revision: "v2",
  previousRevision: "v1",
  changedObjects: [],
  removedObjectKeys: [],
  requiresRebuild: false,
};
function makeMeta(feedHash = "feed"): SharedFeedMeta {
  return {
    feedHash,
    url: `https://example.com/${feedHash}`,
    title: "Feed",
    siteUrl: "https://example.com",
    articleCount: 0,
    pageCount: 0,
    lastFetchedAt: null,
    fetchError: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(readFeedMeta).mockImplementation(async (_bucket, hash) => makeMeta(hash));
  vi.mocked(mergeNewArticlesWithChanges).mockResolvedValue({ newArticles: [article], commit });
  vi.mocked(ensureFeedSearchIndex).mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(xml)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("feed ingestion and derived search index", () => {
  it("syncs committed changes before releasing the body permit", async () => {
    const result = await fetchAndUpdateSharedFeed(env, "feed", true);
    expect(result.newArticles).toEqual([article]);
    expect(ensureFeedSearchIndex).toHaveBeenCalledWith(database, bucket, result.meta, commit);
    expect(vi.mocked(mergeNewArticlesWithChanges).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ensureFeedSearchIndex).mock.invocationCallOrder[0],
    );
    expect(writeFeedMeta).toHaveBeenCalledWith(bucket, result.meta);
  });

  it("keeps R2 success and notifications when D1 synchronization fails", async () => {
    vi.mocked(ensureFeedSearchIndex).mockRejectedValue(new Error("D1 temporarily unavailable"));
    const result = await fetchAndUpdateSharedFeed(env, "feed", true);
    expect(result.newArticles).toEqual([article]);
    expect(result.meta?.fetchError).toBeNull();
    expect(result.meta?.consecutiveErrors).toBe(0);
    expect(result.meta?.lastFetchedAt).toBeTruthy();
    expect(writeFeedMeta).toHaveBeenCalledOnce();
    expect(ensureFeedSearchIndex).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "Article search index update failed",
      expect.objectContaining({ feedHash: "feed" }),
    );
  });

  it("keeps prior conditional validators and error count when the R2 commit fails", async () => {
    const meta = {
      ...makeMeta(),
      etag: '"old"',
      lastModified: "old-modified",
      consecutiveErrors: 2,
      lastFetchedAt: "2026-01-01T00:00:00Z",
    };
    vi.mocked(readFeedMeta).mockResolvedValue(meta);
    vi.mocked(mergeNewArticlesWithChanges).mockRejectedValue(new Error("R2 write failed"));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(xml, {
            headers: {
              ETag: '"new"',
              "Last-Modified": "new-modified",
              "Cache-Control": "max-age=3600",
            },
          }),
      ),
    );
    const result = await fetchAndUpdateSharedFeed(env, "feed", true);
    expect(result.newArticles).toEqual([]);
    expect(meta.etag).toBe('"old"');
    expect(meta.lastModified).toBe("old-modified");
    expect(meta.lastFetchedAt).toBe("2026-01-01T00:00:00Z");
    expect(meta.nextFetchEarliestAt).toBeUndefined();
    expect(meta.consecutiveErrors).toBe(3);
    expect(meta.fetchError).toBe("R2 write failed");
    expect(writeFeedMeta).toHaveBeenCalledWith(bucket, meta);
  });

  it("repairs the existing R2 snapshot on a304 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 304 })),
    );
    const result = await fetchAndUpdateSharedFeed(env, "feed");
    expect(result.newArticles).toEqual([]);
    expect(mergeNewArticlesWithChanges).not.toHaveBeenCalled();
    expect(ensureFeedSearchIndex).toHaveBeenCalledWith(database, bucket, result.meta, undefined);
  });

  it.each(["rate", "cache", "errors"])(
    "repairs an index during %s cooldown without fetching upstream",
    async (reason) => {
      const meta = makeMeta();
      const future = new Date(Date.now() + 60_000).toISOString();
      if (reason === "rate") meta.rateLimitedUntil = future;
      if (reason === "cache") meta.nextFetchEarliestAt = future;
      if (reason === "errors") {
        meta.consecutiveErrors = 5;
        meta.lastErrorAt = new Date().toISOString();
      }
      vi.mocked(readFeedMeta).mockResolvedValue(meta);
      const result = await fetchAndUpdateSharedFeed(env, "feed");
      expect(result.meta).toBe(meta);
      expect(fetch).not.toHaveBeenCalled();
      expect(ensureFeedSearchIndex).toHaveBeenCalledWith(database, bucket, meta, undefined);
    },
  );

  it("does not require a D1 binding for R2 ingestion", async () => {
    const result = await fetchAndUpdateSharedFeed(
      { ...env, ARTICLE_SEARCH: undefined },
      "feed",
      true,
    );
    expect(result.newArticles).toEqual([article]);
    expect(ensureFeedSearchIndex).not.toHaveBeenCalled();
  });

  it("holds the body permit through slow metadata persistence", async () => {
    const release: Array<() => void> = [];
    vi.mocked(writeFeedMeta).mockImplementation(
      () => new Promise<void>((resolve) => release.push(resolve)),
    );
    const limit = createConcurrencyLimiter(2);
    const requests = Array.from({ length: 4 }, (_, i) =>
      fetchAndUpdateSharedFeed(env, `feed-${i}`, true, undefined, limit),
    );
    await vi.waitFor(() => expect(release).toHaveLength(2));
    expect(mergeNewArticlesWithChanges).toHaveBeenCalledTimes(2);
    release[0]();
    release[1]();
    await vi.waitFor(() => expect(release).toHaveLength(4));
    release[2]();
    release[3]();
    await Promise.all(requests);
  });

  it("bounds retained parsed articles while D1 writes are backpressured", async () => {
    const release: Array<() => void> = [];
    vi.mocked(ensureFeedSearchIndex).mockImplementation(
      () => new Promise<void>((resolve) => release.push(resolve)),
    );
    const limit = createConcurrencyLimiter(2);
    const requests = Array.from({ length: 4 }, (_, i) =>
      fetchAndUpdateSharedFeed(env, `feed-${i}`, true, undefined, limit),
    );
    await vi.waitFor(() => expect(release).toHaveLength(2));
    expect(mergeNewArticlesWithChanges).toHaveBeenCalledTimes(2);
    release[0]();
    release[1]();
    await vi.waitFor(() => expect(release).toHaveLength(4));
    release[2]();
    release[3]();
    await Promise.all(requests);
  });
});
