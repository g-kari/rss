// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedFeedMeta } from "../types";
import { makeArticle } from "../../e2e/helpers/article";
import {
  buildArticle,
  buildBatchedPushPayload,
  FEED_NETWORK_CONCURRENCY,
  FEED_PARSE_CONCURRENCY,
  fetchAllFeeds,
  fetchAndUpdateSharedFeed,
  fetchArticles,
} from "./fetch";
import * as concurrency from "../lib/concurrency";
import * as r2 from "../lib/r2";
import * as webPush from "../lib/web-push";
import * as searchIndex from "../lib/article-search-index";
import { LegacyArticleWriteConflictError } from "../lib/shared-feed-legacy";
import type { PushConfig } from "../types";
import {
  buildFeedUserMapCached,
  mergeNewArticlesWithChanges,
  readFeedMeta,
  readLatestArticles,
  readUserSubscriptions,
  writeFeedMeta,
} from "../lib/shared-feed";
import { parseFeed } from "../lib/xml-parser";
import { scrapeFeed } from "../lib/llm-feed-generator";

vi.mock("../lib/shared-feed", () => ({
  buildFeedUserMapCached: vi.fn(),
  mergeNewArticlesWithChanges: vi.fn(
    async (_bucket: unknown, _meta: unknown, articles: unknown) => ({ newArticles: articles }),
  ),
  readFeedMeta: vi.fn(),
  repairFeedArticleMetadata: vi.fn(async () => {}),
  readLatestArticles: vi.fn(async () => []),
  readUserSubscriptions: vi.fn(),
  writeFeedMeta: vi.fn(),
  computeArticleId: vi.fn(async (_url: string, guid: string) => guid),
}));
vi.mock("../lib/xml-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/xml-parser")>();
  return { ...actual, parseFeed: vi.fn(actual.parseFeed) };
});
vi.mock("../lib/llm-feed-generator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/llm-feed-generator")>();
  return { ...actual, scrapeFeed: vi.fn(actual.scrapeFeed) };
});

const MAX_BYTES = 10 * 1024 * 1024;
const env = {
  RSS_DATA: {} as R2Bucket,
  RATE_LIMIT: {} as KVNamespace,
  FINDME_RSS: undefined,
} as unknown as Parameters<typeof fetchArticles>[0];
const XML =
  "<rss><channel><title>Updated</title><link>https://example.com</link><item><guid>article-1</guid><title>Item</title><link>https://example.com/1</link></item></channel></rss>";
const selectors = { articleLink: "a", model: "test", generatedAt: "2026-01-01T00:00:00Z" };
const HTML = '<html><body><a href="/1">Article one</a></body></html>';

function makeMeta(feedHash = "feed-1"): SharedFeedMeta {
  return {
    feedHash,
    url: `https://example.com/${feedHash}`,
    title: "Original",
    siteUrl: "https://example.com",
    lastFetchedAt: "2026-01-01T00:00:00Z",
    fetchError: null,
    consecutiveErrors: 0,
    lastErrorAt: null,
    rateLimitedUntil: null,
    articleCount: 0,
    pageCount: 0,
    etag: '"old"',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(readFeedMeta).mockImplementation(async (_bucket, hash) => makeMeta(hash));
  vi.mocked(mergeNewArticlesWithChanges).mockImplementation(async (_bucket, _meta, articles) => ({
    newArticles: articles,
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("automatic retry after consecutive errors", () => {
  const lastErrorAt = "2026-09-30T03:00:55Z";
  const retryAt = new Date(lastErrorAt).getTime() + 24 * 60 * 60 * 1000;

  function failedMeta(): SharedFeedMeta {
    const meta = {
      ...makeMeta(),
      consecutiveErrors: 5,
      fetchError: "Response closed due to connection limit",
      lastErrorAt,
    };
    vi.mocked(readFeedMeta).mockResolvedValue(meta);
    vi.useFakeTimers();
    return meta;
  }

  it("makes no upstream request one millisecond before the 24-hour boundary", async () => {
    const meta = failedMeta();
    vi.setSystemTime(retryAt - 1);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await fetchAndUpdateSharedFeed(env, meta.feedHash);
    expect(fetch).not.toHaveBeenCalled();
    expect(writeFeedMeta).not.toHaveBeenCalled();
    expect(meta.lastErrorAt).toBe(lastErrorAt);
    expect(meta.consecutiveErrors).toBe(5);
  });

  it.each([0, 1])(
    "retries naturally at the boundary plus %i milliseconds and clears success state",
    async (offset) => {
      const meta = failedMeta();
      vi.setSystemTime(retryAt + offset);
      const fetch = vi.fn().mockResolvedValue(new Response(XML));
      vi.stubGlobal("fetch", fetch);
      await fetchAndUpdateSharedFeed(env, meta.feedHash);
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0][1].headers["If-None-Match"]).toBe('"old"');
      expect(meta.fetchError).toBeNull();
      expect(meta.consecutiveErrors).toBe(0);
      expect(meta.lastErrorAt).toBeNull();
      expect(meta.lastFetchedAt).toBe(new Date(retryAt + offset).toISOString());
      expect(writeFeedMeta).toHaveBeenCalledOnce();
    },
  );

  it("a failed natural retry keeps count five and starts another 24-hour wait", async () => {
    const meta = failedMeta();
    vi.setSystemTime(retryAt);
    const fetch = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", fetch);
    await fetchAndUpdateSharedFeed(env, meta.feedHash);
    expect(fetch).toHaveBeenCalledOnce();
    expect(meta.consecutiveErrors).toBe(5);
    expect(meta.lastErrorAt).toBe(new Date(retryAt).toISOString());
    expect(meta.lastFetchedAt).toBe("2026-01-01T00:00:00Z");
    vi.setSystemTime(retryAt + 1);
    await fetchAndUpdateSharedFeed(env, meta.feedHash);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["rateLimitedUntil", "nextFetchEarliestAt"] as const)(
    "still respects %s after error retry eligibility",
    async (field) => {
      const meta = failedMeta();
      vi.setSystemTime(retryAt);
      meta[field] = new Date(retryAt + 60_000).toISOString();
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await fetchAndUpdateSharedFeed(env, meta.feedHash);
      expect(fetch).not.toHaveBeenCalled();
      expect(meta.lastErrorAt).toBe(lastErrorAt);
    },
  );
});

describe("safe article rollout defaults", () => {
  it("does not overwrite winner metadata or index after a legacy CAS conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(XML, { headers: { ETag: '"new"' } })),
    );
    const meta = makeMeta();
    vi.mocked(readFeedMeta).mockResolvedValue(meta);
    const conflict = new LegacyArticleWriteConflictError("Concurrent legacy writer");
    vi.mocked(mergeNewArticlesWithChanges).mockRejectedValue(conflict);
    const index = vi.spyOn(searchIndex, "ensureFeedSearchIndex");
    await expect(fetchAndUpdateSharedFeed(env, "feed-1", true)).rejects.toBe(conflict);
    expect(meta.etag).toBe('"old"');
    expect(meta.title).toBe("Original");
    expect(meta.lastFetchedAt).toBe("2026-01-01T00:00:00Z");
    expect(meta.articleCount).toBe(0);
    expect(writeFeedMeta).not.toHaveBeenCalled();
    expect(index).not.toHaveBeenCalled();
  });
  it.each([undefined, "false", "invalid"])(
    "keeps legacy writes and does not use an attached D1 with gate %s",
    async (flag) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(XML)));
      const index = vi.spyOn(searchIndex, "ensureFeedSearchIndex");
      const prepare = vi.fn(() => {
        throw new Error("Unprepared D1 must not be accessed");
      });
      await fetchAndUpdateSharedFeed(
        {
          ...env,
          ARTICLE_SEARCH: { prepare } as unknown as D1Database,
          RSS_ARTICLE_STORAGE_V2: flag,
          RSS_ARTICLE_SEARCH_INDEX: flag,
        },
        "feed-1",
        true,
      );
      expect(mergeNewArticlesWithChanges).toHaveBeenCalledWith(
        env.RSS_DATA,
        expect.any(Object),
        expect.any(Array),
        [],
        { allowLegacyMigration: false, maintainSearchIndex: true },
      );
      expect(index).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it("enables storage and index updates only after explicit activation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(XML)));
    const index = vi.spyOn(searchIndex, "ensureFeedSearchIndex").mockResolvedValue(undefined);
    const db = {} as D1Database;
    await fetchAndUpdateSharedFeed(
      {
        ...env,
        ARTICLE_SEARCH: db,
        RSS_ARTICLE_STORAGE_V2: "true",
        RSS_ARTICLE_SEARCH_INDEX: "true",
      },
      "feed-1",
      true,
    );
    expect(mergeNewArticlesWithChanges).toHaveBeenCalledWith(
      env.RSS_DATA,
      expect.any(Object),
      expect.any(Array),
      [],
      { allowLegacyMigration: true, maintainSearchIndex: true },
    );
    expect(index).toHaveBeenCalledWith(db, env.RSS_DATA, expect.any(Object), undefined);
  });

  it("keeps the writer pause stronger than both rollout gates", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchAndUpdateSharedFeed(
        {
          ...env,
          RSS_FEED_WRITES_PAUSED: "true",
          RSS_ARTICLE_STORAGE_V2: "true",
          RSS_ARTICLE_SEARCH_INDEX: "true",
        },
        "feed-1",
        true,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(readFeedMeta).not.toHaveBeenCalled();
    expect(mergeNewArticlesWithChanges).not.toHaveBeenCalled();
  });
});

describe("bounded feed bodies", () => {
  it.each([false, true])(
    "rejects oversized %s selector/XML streams without partial parsing or success metadata",
    async (useSelectors) => {
      const meta = { ...makeMeta(), cssSelectors: useSelectors ? selectors : undefined };
      vi.mocked(readFeedMeta).mockResolvedValue(meta);
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(useSelectors ? HTML : XML));
          controller.enqueue(new Uint8Array(MAX_BYTES));
        },
        cancel,
      });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(body, { headers: { ETag: '"new"', "Content-Length": "1" } }),
          ),
      );
      const result = await fetchAndUpdateSharedFeed(env, meta.feedHash, true);
      expect(result.newArticles).toEqual([]);
      expect(meta.fetchError).toContain("exceeds");
      expect(meta.consecutiveErrors).toBe(1);
      expect(meta.lastFetchedAt).toBe("2026-01-01T00:00:00Z");
      expect(meta.etag).toBe('"old"');
      expect(meta.title).toBe("Original");
      expect(parseFeed).not.toHaveBeenCalled();
      expect(scrapeFeed).not.toHaveBeenCalled();
      expect(readLatestArticles).not.toHaveBeenCalled();
      expect(mergeNewArticlesWithChanges).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(writeFeedMeta).toHaveBeenCalledOnce();
    },
  );

  it.each([MAX_BYTES - 1, MAX_BYTES])("fully parses valid XML of %i bytes", async (size) => {
    const xml = `${XML.slice(0, -6)}${" ".repeat(size - XML.length)}</rss>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml)));
    const result = await fetchAndUpdateSharedFeed(env, "feed-1", true);
    expect(result.meta?.fetchError).toBeNull();
    expect(result.newArticles).toHaveLength(1);
    expect(parseFeed).toHaveBeenCalledOnce();
    expect(vi.mocked(parseFeed).mock.calls[0][0].length).toBe(size);
  });

  it("keeps 304 success and conditional request semantics without reading a body", async () => {
    const meta = { ...makeMeta(), fetchError: "previous", consecutiveErrors: 2 };
    vi.mocked(readFeedMeta).mockResolvedValue(meta);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 304, headers: { "Cache-Control": "max-age=3600" } }),
      );
    vi.stubGlobal("fetch", fetch);
    await fetchAndUpdateSharedFeed(env, meta.feedHash);
    expect(fetch.mock.calls[0][1].headers["If-None-Match"]).toBe('"old"');
    expect(meta.fetchError).toBeNull();
    expect(meta.consecutiveErrors).toBe(0);
    expect(meta.nextFetchEarliestAt).toBeTruthy();
    expect(parseFeed).not.toHaveBeenCalled();
    expect(mergeNewArticlesWithChanges).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "preserves 429 retry-after and cancels its unused body (selectors=%s)",
    async (useSelectors) => {
      const meta = { ...makeMeta(), cssSelectors: useSelectors ? selectors : undefined };
      vi.mocked(readFeedMeta).mockResolvedValue(meta);
      const cancel = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new ReadableStream({ cancel }), {
            status: 429,
            headers: { "Retry-After": "120" },
          }),
        ),
      );
      const before = Date.now();
      await fetchAndUpdateSharedFeed(env, meta.feedHash, true);
      expect(new Date(meta.rateLimitedUntil!).getTime()).toBeGreaterThanOrEqual(before + 120_000);
      expect(meta.consecutiveErrors).toBe(0);
      expect(meta.fetchError).toContain("Rate limited");
      expect(parseFeed).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
});

describe("feed body concurrency", () => {
  it.each(["refresh", "cron"])(
    "%s keeps body reads at the parse limit while header fetches run ahead",
    async (mode) => {
      const hashes = Array.from({ length: 20 }, (_, i) => `feed-${i}`);
      vi.mocked(readUserSubscriptions).mockResolvedValue(
        hashes.map((feedHash) => ({
          feedHash,
          url: `https://example.com/${feedHash}`,
          subscribedAt: "2026-01-01T00:00:00Z",
        })),
      );
      vi.mocked(buildFeedUserMapCached).mockResolvedValue({
        feedUserMap: new Map(hashes.map((hash) => [hash, []])),
        feedLastAccessMap: new Map(),
        feedHasPriority: new Set(),
        privateFeedCookies: new Map(),
      });
      vi.mocked(readFeedMeta).mockImplementation(async (_bucket, hash) => ({
        ...makeMeta(hash),
        cssSelectors: Number(hash.split("-")[1]) % 2 ? selectors : undefined,
      }));
      let reading = 0;
      let peak = 0;
      let openResponses = 0;
      let peakResponses = 0;
      const release: Array<() => void> = [];
      const fetch = vi.fn(async (url: string) => {
        const i = Number(new URL(url).pathname.split("-")[1]);
        openResponses++;
        peakResponses = Math.max(peakResponses, openResponses);
        let started = false;
        let closed = false;
        const finishResponse = () => {
          if (closed) return;
          closed = true;
          openResponses--;
        };
        return new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                if (started) return;
                started = true;
                reading++;
                peak = Math.max(peak, reading);
                release.push(() => {
                  reading--;
                  finishResponse();
                  controller.enqueue(new TextEncoder().encode(i % 2 ? HTML : XML));
                  controller.close();
                });
              },
              cancel() {
                finishResponse();
              },
            },
            { highWaterMark: 0 },
          ),
        );
      });
      vi.stubGlobal("fetch", fetch);
      const run = mode === "refresh" ? fetchArticles(env, "user") : fetchAllFeeds(env);
      await vi.waitFor(() => {
        expect(reading).toBe(FEED_PARSE_CONCURRENCY);
        expect(fetch.mock.calls.length).toBeGreaterThan(FEED_PARSE_CONCURRENCY);
      });
      expect(peakResponses).toBeLessThanOrEqual(FEED_NETWORK_CONCURRENCY);
      expect(peakResponses).toBeGreaterThan(FEED_PARSE_CONCURRENCY);
      expect(reading).toBe(FEED_PARSE_CONCURRENCY);
      for (let i = 0; i < hashes.length; i++) {
        await vi.waitFor(() => expect(release.length).toBeGreaterThan(i));
        release[i]();
      }
      await run;
      expect(peak).toBe(FEED_PARSE_CONCURRENCY);
      expect(peakResponses).toBeLessThanOrEqual(FEED_NETWORK_CONCURRENCY);
      expect(peakResponses).toBeGreaterThan(FEED_PARSE_CONCURRENCY);
      expect(openResponses).toBe(0);
      expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(20);
      expect(reading).toBe(0);
      expect(parseFeed).toHaveBeenCalledTimes(10);
      expect(
        vi.mocked(parseFeed).mock.calls.every(([, options]) => options?.maxItems === 1000),
      ).toBe(true);
      expect(scrapeFeed).toHaveBeenCalledTimes(10);
      expect(writeFeedMeta).toHaveBeenCalledTimes(20);
      expect(vi.mocked(writeFeedMeta).mock.calls.every(([, meta]) => !meta.fetchError)).toBe(true);
    },
  );
});

it("cancels stalled bodies, admits waiting feeds, and allows a successful forced retry", async () => {
  vi.useFakeTimers();
  const metas = Array.from({ length: 6 }, (_, i) => makeMeta(`feed-${i}`));
  vi.mocked(readUserSubscriptions).mockResolvedValue(
    metas.map(({ feedHash, url }) => ({ feedHash, url, subscribedAt: "2026-01-01T00:00:00Z" })),
  );
  vi.mocked(readFeedMeta).mockImplementation(
    async (_bucket, hash) => metas.find((meta) => meta.feedHash === hash) ?? null,
  );
  const cancel = vi.fn();
  let count = 0;
  const fetch = vi.fn(async () => {
    count++;
    return count <= 2
      ? new Response(new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 }))
      : new Response(XML);
  });
  vi.stubGlobal("fetch", fetch);
  const run = fetchArticles(env, "user");
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(FEED_PARSE_CONCURRENCY);
  await vi.advanceTimersByTimeAsync(15_000);
  await run;
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(6);
  expect(metas.filter((meta) => meta.fetchError)).toHaveLength(2);
  expect(metas.filter((meta) => !meta.fetchError)).toHaveLength(4);
  for (const meta of metas.filter((meta) => meta.fetchError)) {
    const retry = await fetchAndUpdateSharedFeed(env, meta.feedHash, true);
    expect(retry.meta?.fetchError).toBeNull();
    expect(retry.meta?.consecutiveErrors).toBe(0);
    expect(retry.newArticles).toHaveLength(1);
  }
});

it("holds body permits until article storage finishes", async () => {
  const hashes = Array.from({ length: 4 }, (_, i) => `feed-${i}`);
  vi.mocked(readUserSubscriptions).mockResolvedValue(
    hashes.map((feedHash) => ({
      feedHash,
      url: `https://example.com/${feedHash}`,
      subscribedAt: "2026-01-01T00:00:00Z",
    })),
  );
  const finishStorage: Array<() => void> = [];
  vi.mocked(mergeNewArticlesWithChanges).mockImplementation(async () => {
    await new Promise<void>((resolve) => finishStorage.push(resolve));
    return { newArticles: [] };
  });
  const fetch = vi.fn(async () => new Response(XML));
  vi.stubGlobal("fetch", fetch);
  const run = fetchArticles(env, "user");
  await vi.waitFor(() => expect(finishStorage).toHaveLength(FEED_PARSE_CONCURRENCY));
  expect(fetch.mock.calls.length).toBeGreaterThan(FEED_PARSE_CONCURRENCY);
  expect(parseFeed).toHaveBeenCalledTimes(FEED_PARSE_CONCURRENCY);
  expect(finishStorage).toHaveLength(FEED_PARSE_CONCURRENCY);
  for (let i = 0; i < 4; i++) {
    await vi.waitFor(() => expect(finishStorage.length).toBeGreaterThan(i));
    finishStorage[i]();
  }
  await run;
  expect(parseFeed).toHaveBeenCalledTimes(4);
});

describe("completed feed result retention", () => {
  it.each(["cron", "refresh"])(
    "%s discards full articles and feed metadata after each task",
    async (mode) => {
      const hashes = ["one", "two"];
      vi.mocked(readUserSubscriptions).mockResolvedValue(
        hashes.map((feedHash) => ({
          feedHash,
          url: `https://example.com/${feedHash}`,
          subscribedAt: "2026-01-01T00:00:00Z",
        })),
      );
      vi.mocked(buildFeedUserMapCached).mockResolvedValue({
        feedUserMap: new Map(hashes.map((hash) => [hash, []])),
        feedLastAccessMap: new Map(),
        feedHasPriority: new Set(),
        privateFeedCookies: new Map(),
      });
      vi.mocked(readFeedMeta).mockImplementation(async (_bucket, hash) => ({
        ...makeMeta(hash),
        knownIds: Array.from({ length: 10_000 }, (_, i) => `id-${i}`),
      }));
      vi.mocked(mergeNewArticlesWithChanges).mockImplementation(
        async (_bucket, _meta, articles) => ({
          newArticles: articles.map((article) => ({
            ...article,
            summary: "x".repeat(5000),
            metadata: [{ key: "large", value: "x".repeat(10_000) }],
          })),
        }),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(XML)),
      );
      const map = vi.spyOn(concurrency, "pMapSettled");
      if (mode === "cron") await fetchAllFeeds(env);
      else await fetchArticles(env, "user");
      const completed = await map.mock.results[0].value;
      expect(completed).toEqual(hashes.map(() => ({ status: "fulfilled", value: undefined })));
    },
  );

  it("keeps single-article behavior and previews compact multi-article summaries", () => {
    expect(
      buildBatchedPushPayload([
        { articleCount: 1, articleTitles: ["Headline"], feedTitle: "Feed", feedHash: "a" },
      ]),
    ).toEqual({ title: "Feed", body: "Headline", url: "/" });
    expect(
      buildBatchedPushPayload([
        { articleCount: 1, articleTitles: [], feedTitle: "Feed", feedHash: "a" },
      ]),
    ).toEqual({ title: "Feed", body: "新着記事", url: "/" });
    expect(
      buildBatchedPushPayload([
        { articleCount: 3, articleTitles: ["Headline"], feedTitle: "Feed", feedHash: "a" },
      ]),
    ).toEqual({ title: "Feed", body: "3 件の新着記事\nHeadline\nほか 2 件", url: "/" });
    expect(
      buildBatchedPushPayload([
        {
          articleCount: 3,
          articleTitles: ["Headline", "Second"],
          feedTitle: "Feed",
          feedHash: "a",
        },
        { articleCount: 2, articleTitles: ["Other"], feedTitle: "Other feed", feedHash: "b" },
      ]),
    ).toEqual({
      title: "RSS Reader",
      body: "5 件の新着記事（2 フィード）\nHeadline\nOther\nSecond\nほか 2 件",
      url: "/",
    });
  });

  it("shows at most three representative titles across feeds before adding second titles", () => {
    const payload = buildBatchedPushPayload([
      {
        articles: ["A1", "A2", "A3", "A4"].map((title) => makeArticle({ title })),
        feedTitle: "A",
        feedHash: "a",
      },
      { articles: [makeArticle({ title: "B1" })], feedTitle: "B", feedHash: "b" },
      { articles: [makeArticle({ title: "C1" })], feedTitle: "C", feedHash: "c" },
      { articles: [makeArticle({ title: "D1" })], feedTitle: "D", feedHash: "d" },
    ]);
    expect(payload).toEqual({
      title: "RSS Reader",
      body: "7 件の新着記事（4 フィード）\nA1\nB1\nC1\nほか 4 件",
      url: "/",
    });
  });

  it("counts articles without usable titles and scans past blanks for previews", () => {
    const payload = buildBatchedPushPayload([
      {
        articles: ["", " \n\t", "<b></b>", "<b>Useful</b>\n heading", "Last"].map((title) =>
          makeArticle({ title }),
        ),
        feedTitle: "Feed",
        feedHash: "a",
      },
    ]);
    expect(payload.body).toBe("5 件の新着記事\nUseful heading\nLast\nほか 3 件");
  });

  it.each(["", " \n\t", "<b></b>"])(
    "uses the single-article fallback for unusable title %j",
    (title) => {
      expect(
        buildBatchedPushPayload([
          { articles: [makeArticle({ title })], feedTitle: "Feed", feedHash: "a" },
        ]),
      ).toEqual({ title: "Feed", body: "新着記事", url: "/" });
    },
  );

  it("keeps count-only fallbacks for all-blank titles and empty batches", () => {
    expect(
      buildBatchedPushPayload([
        {
          articles: [makeArticle({ title: "" }), makeArticle({ title: " " })],
          feedTitle: "Feed",
          feedHash: "a",
        },
      ]).body,
    ).toBe("2 件の新着記事");
    expect(buildBatchedPushPayload([])).toEqual({
      title: "RSS Reader",
      body: "0 件の新着記事（0 フィード）",
      url: "/",
    });
    expect(buildBatchedPushPayload([{ articles: [], feedTitle: "Feed", feedHash: "a" }])).toEqual({
      title: "Feed",
      body: "0 件の新着記事",
      url: "/",
    });
  });

  it("bounds Unicode titles and body without splitting emoji or losing the remaining count", () => {
    const payload = buildBatchedPushPayload([
      {
        articles: Array.from({ length: 1000 }, () => makeArticle({ title: "📰".repeat(10000) })),
        feedTitle: "🗞️".repeat(1000),
        feedHash: "a",
      },
    ]);
    expect(Array.from(payload.title)).toHaveLength(80);
    expect(Array.from(payload.body).length).toBeLessThanOrEqual(300);
    expect(payload.body).toBe(
      `1000 件の新着記事\n${"📰".repeat(79)}…\n${"📰".repeat(79)}…\n${"📰".repeat(79)}…\nほか 997 件`,
    );
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(4000);
    const single = buildBatchedPushPayload([
      { articles: [makeArticle({ title: "📰".repeat(81) })], feedTitle: "Feed", feedHash: "a" },
    ]);
    expect(single.body).toBe(`${"📰".repeat(79)}…`);
  });
});

describe("non-string publisher PUSH titles", () => {
  function jsonFeed(titles: unknown[]): string {
    return JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "JSON feed",
      home_page_url: "https://example.com/",
      items: titles.map((title, index) => ({
        id: `json-${index}`,
        title,
        url: `https://example.com/${index}`,
        content_text: "Article content",
      })),
    });
  }

  it.each([
    42,
    0,
    true,
    false,
    { text: "Not a preview" },
    ["Not a preview"],
    null,
    undefined,
    "",
    "新刊 📰 café é 𝄞",
  ])(
    "produces display-safe JSON Feed title %j and safely previews legacy titles",
    async (title) => {
      const meta = makeMeta();
      const body = jsonFeed([title]);
      const parsed = parseFeed(body);
      const expectedTitle = typeof title === "string" ? title : "";
      expect(parsed.items[0].title).toBe(expectedTitle);
      const article = await buildArticle(parsed.items[0], meta.feedHash, meta.url, new Map());
      expect(typeof article.title).toBe("string");
      expect(article.title).toBe(expectedTitle);
      expect(
        buildBatchedPushPayload([
          { articles: [article], feedTitle: parsed.title, feedHash: meta.feedHash },
        ]),
      ).toEqual({ title: "JSON feed", body: expectedTitle || "新着記事", url: "/" });
      // Legacy storage can still violate the static Article title type.
      expect(
        buildBatchedPushPayload([
          {
            articles: [makeArticle({ title: title as string })],
            feedTitle: parsed.title,
            feedHash: meta.feedHash,
          },
        ]),
      ).toEqual({ title: "JSON feed", body: expectedTitle || "新着記事", url: "/" });
    },
  );

  it.each([
    { name: "single-article fallback", titles: [42], expectedBody: "新着記事" },
    {
      name: "count-only fallback",
      titles: [42, true, { text: "Not a preview" }, ["Not a preview"]],
      expectedBody: "4 件の新着記事",
    },
    {
      name: "valid sibling previews",
      titles: [42, { text: "Not a preview" }, "<b>Useful</b>\n sibling", "Last"],
      expectedBody: "4 件の新着記事\nUseful sibling\nLast\nほか 2 件",
    },
  ])(
    "keeps cron timestamps and $name after the article commit",
    async ({ titles, expectedBody }) => {
      const now = "2026-10-06T08:00:00.000Z";
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      const meta = makeMeta();
      const body = jsonFeed(titles);
      const users = ["enabled", "off", "silent"];
      vi.mocked(buildFeedUserMapCached).mockResolvedValue({
        feedUserMap: new Map([[meta.feedHash, users]]),
        feedLastAccessMap: new Map(),
        feedHasPriority: new Set(),
        privateFeedCookies: new Map(),
      });
      vi.mocked(readFeedMeta).mockResolvedValue(meta);
      let committed = false;
      vi.mocked(mergeNewArticlesWithChanges).mockImplementation(
        async (_bucket, _meta, articles) => {
          expect(articles.map((article) => article.title)).toEqual(
            titles.map((title) => (typeof title === "string" ? title : "")),
          );
          expect(articles.every((article) => typeof article.title === "string")).toBe(true);
          committed = true;
          return { newArticles: articles };
        },
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      vi.spyOn(r2, "r2Get").mockImplementation(
        async <T>(_bucket: R2Bucket, key: string): Promise<T> => {
          const user = users.find((user) => key === r2.userPushKey(user));
          return (
            user
              ? {
                  subscriptions: [
                    {
                      endpoint: `https://push.example.com/${user}`,
                      expirationTime: null,
                      keys: { p256dh: "test", auth: "test" },
                    },
                  ],
                  ...(user === "off" ? { disabledFeeds: { [meta.feedHash]: true } } : {}),
                  ...(user === "silent"
                    ? { silentStart: "00:00", silentEnd: "24:00", timezone: "UTC" }
                    : {}),
                }
              : { untouched: "2025-01-01T00:00:00Z" }
          ) as T;
        },
      );
      const put = vi.spyOn(r2, "r2Put").mockImplementation(async () => {
        expect(committed).toBe(true);
      });
      const push = vi.spyOn(webPush, "sendPushToAll").mockImplementation(async (subscriptions) => {
        expect(committed).toBe(true);
        return subscriptions;
      });
      await fetchAllFeeds(env);
      expect(mergeNewArticlesWithChanges).toHaveBeenCalledOnce();
      expect(writeFeedMeta).toHaveBeenCalledWith(env.RSS_DATA, meta);
      expect(meta.lastFetchedAt).toBe(now);
      expect(meta.fetchError).toBeNull();
      for (const user of users) {
        expect(put).toHaveBeenCalledWith(env.RSS_DATA, r2.feedLastFetchedKey(user), {
          untouched: "2025-01-01T00:00:00Z",
          [meta.feedHash]: now,
        });
      }
      expect(push).toHaveBeenCalledExactlyOnceWith(
        expect.arrayContaining([
          expect.objectContaining({ endpoint: "https://push.example.com/enabled" }),
        ]),
        { title: "JSON feed", body: expectedBody, url: "/" },
      );
    },
  );
});

it.each([
  { rotationOffset: 0, now: "2026-10-06T09:00:00.000Z" },
  { rotationOffset: 1, now: "2026-10-06T08:30:00.000Z" },
  { rotationOffset: 2, now: "2026-10-06T08:00:00.000Z" },
])(
  "preserves per-user push filtering, errors, and timestamps at rotation offset $rotationOffset",
  async ({ rotationOffset, now }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const hashes = ["one", "two", "error"];
    const users = ["all", "filtered", "off", "silent"];
    vi.mocked(buildFeedUserMapCached).mockResolvedValue({
      feedUserMap: new Map(hashes.map((hash) => [hash, users])),
      feedLastAccessMap: new Map(),
      feedHasPriority: new Set(),
      privateFeedCookies: new Map(),
    });
    vi.mocked(readFeedMeta).mockImplementation(async (_bucket, hash) => ({
      ...makeMeta(hash),
      consecutiveErrors: hash === "error" ? 4 : 0,
    }));
    vi.mocked(mergeNewArticlesWithChanges).mockImplementation(async (_bucket, meta, articles) => ({
      newArticles:
        meta.feedHash === "two"
          ? [makeArticle({ title: "Disabled one" }), makeArticle({ title: "Disabled two" })]
          : articles,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(url.endsWith("error") ? "error" : XML, {
            status: url.endsWith("error") ? 500 : 200,
          }),
      ),
    );
    const configurations = new Map<string, PushConfig>(
      users.map((user): [string, PushConfig] => [
        r2.userPushKey(user),
        {
          subscriptions: [
            {
              endpoint: `https://push.example.com/${user}`,
              expirationTime: null,
              keys: { p256dh: "test", auth: "test" },
            },
          ],
          disabledFeeds:
            user === "filtered"
              ? { two: true, error: true }
              : user === "off"
                ? { one: true, two: true, error: true }
                : undefined,
          ...(user === "silent"
            ? { silentStart: "00:00", silentEnd: "24:00", timezone: "UTC" }
            : {}),
        },
      ]),
    );
    vi.spyOn(r2, "r2Get").mockImplementation(
      async <T>(_bucket: R2Bucket, key: string): Promise<T> =>
        (configurations.get(key) ?? { untouched: "2025-01-01T00:00:00Z" }) as T,
    );
    const put = vi.spyOn(r2, "r2Put").mockResolvedValue(undefined);
    const push = vi
      .spyOn(webPush, "sendPushToAll")
      .mockImplementation(async (subscriptions) => subscriptions);
    const map = vi.spyOn(concurrency, "pMapSettled");
    await fetchAllFeeds(env);
    expect(map.mock.calls[0][0]).toEqual([
      ...hashes.slice(rotationOffset),
      ...hashes.slice(0, rotationOffset),
    ]);
    expect(push).toHaveBeenCalledTimes(3);
    const payloadsFor = (user: string) =>
      push.mock.calls
        .filter(([subscriptions]) => subscriptions[0].endpoint.endsWith(user))
        .map(([, payload]) => payload);
    const allPayloads = payloadsFor("all");
    expect(allPayloads).toHaveLength(2);
    const [{ body, ...newArticlePayload }, errorPayload] = allPayloads;
    expect(newArticlePayload).toEqual({ title: "RSS Reader", url: "/" });
    const [count, ...previews] = body.split("\n");
    expect(count).toBe("3 件の新着記事（2 フィード）");
    // Feed summaries arrive in completion order, which may vary with the batch rotation.
    // Keep exact membership and the one-per-feed first round without ordering those feeds.
    expect(previews).toHaveLength(3);
    expect([...previews].sort()).toEqual(["Disabled one", "Disabled two", "Item"]);
    expect(previews.slice(0, 2).sort()).toEqual(["Disabled one", "Item"]);
    expect(previews[2]).toBe("Disabled two");
    expect(errorPayload).toEqual({
      title: "フィードのエラー",
      body: "「Original」の取得に連続して失敗しています",
      url: "/",
    });
    expect(payloadsFor("filtered")).toEqual([{ title: "Updated", body: "Item", url: "/" }]);
    expect(payloadsFor("off")).toEqual([]);
    expect(payloadsFor("silent")).toEqual([]);
    expect(put).toHaveBeenCalledTimes(users.length);
    for (const user of users) {
      expect(put).toHaveBeenCalledWith(env.RSS_DATA, r2.feedLastFetchedKey(user), {
        untouched: "2025-01-01T00:00:00Z",
        error: "2026-01-01T00:00:00Z",
        one: now,
        two: now,
      });
    }
  },
);
