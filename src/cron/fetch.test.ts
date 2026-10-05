// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedFeedMeta } from "../types";
import {
  buildBatchedPushPayload,
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
        { allowLegacyMigration: false },
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
      { allowLegacyMigration: true },
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
    "%s starts at most two upstream responses and consumes them without a queued body",
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
                  openResponses--;
                  controller.enqueue(new TextEncoder().encode(i % 2 ? HTML : XML));
                  controller.close();
                });
              },
            },
            { highWaterMark: 0 },
          ),
        );
      });
      vi.stubGlobal("fetch", fetch);
      const run = mode === "refresh" ? fetchArticles(env, "user") : fetchAllFeeds(env);
      await vi.waitFor(() => expect(reading).toBe(2));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(reading).toBe(2);
      for (let i = 0; i < hashes.length; i++) {
        await vi.waitFor(() => expect(release.length).toBeGreaterThan(i));
        release[i]();
      }
      await run;
      expect(peak).toBe(2);
      expect(peakResponses).toBe(2);
      expect(openResponses).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(20);
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
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(cancel).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_000);
  await run;
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(6);
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
  await vi.waitFor(() => expect(finishStorage).toHaveLength(2));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(parseFeed).toHaveBeenCalledTimes(2);
  expect(finishStorage).toHaveLength(2);
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

  it("keeps notification payloads identical for compact summaries", () => {
    expect(
      buildBatchedPushPayload([
        { articleCount: 1, firstArticleTitle: "Headline", feedTitle: "Feed", feedHash: "a" },
      ]),
    ).toEqual({ title: "Feed", body: "Headline", url: "/" });
    expect(
      buildBatchedPushPayload([
        { articleCount: 1, firstArticleTitle: "", feedTitle: "Feed", feedHash: "a" },
      ]),
    ).toEqual({ title: "Feed", body: "新着記事", url: "/" });
    expect(
      buildBatchedPushPayload([
        { articleCount: 3, firstArticleTitle: "Headline", feedTitle: "Feed", feedHash: "a" },
      ]),
    ).toEqual({ title: "Feed", body: "3 件の新着記事", url: "/" });
    expect(
      buildBatchedPushPayload([
        { articleCount: 3, firstArticleTitle: "Headline", feedTitle: "Feed", feedHash: "a" },
        { articleCount: 2, firstArticleTitle: "Other", feedTitle: "Other feed", feedHash: "b" },
      ]),
    ).toEqual({ title: "RSS Reader", body: "5 件の新着記事（2 フィード）", url: "/" });
  });
});

it("preserves per-user push filtering, error notifications, and merged timestamps with compact results", async () => {
  const hashes = ["one", "two", "error"];
  const users = ["all", "filtered"];
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
    newArticles: meta.feedHash === "two" ? [...articles, ...articles] : articles,
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
    users.map((user) => [
      r2.userPushKey(user),
      {
        subscriptions: [
          {
            endpoint: `https://push.example.com/${user}`,
            expirationTime: null,
            keys: { p256dh: "test", auth: "test" },
          },
        ],
        disabledFeeds: user === "filtered" ? { two: true, error: true } : undefined,
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
  await fetchAllFeeds(env);
  const payloadsFor = (user: string) =>
    push.mock.calls
      .filter(([subscriptions]) => subscriptions[0].endpoint.endsWith(user))
      .map(([, payload]) => payload);
  expect(payloadsFor("all")).toEqual([
    { title: "RSS Reader", body: "3 件の新着記事（2 フィード）", url: "/" },
    { title: "フィードのエラー", body: "「Original」の取得に連続して失敗しています", url: "/" },
  ]);
  expect(payloadsFor("filtered")).toEqual([{ title: "Updated", body: "Item", url: "/" }]);
  for (const user of users) {
    expect(put).toHaveBeenCalledWith(env.RSS_DATA, r2.feedLastFetchedKey(user), {
      untouched: "2025-01-01T00:00:00Z",
      error: "2026-01-01T00:00:00Z",
      one: expect.any(String),
      two: expect.any(String),
    });
  }
});
