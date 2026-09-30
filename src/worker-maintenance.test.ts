// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delegate: vi.fn(),
  fetchAll: vi.fn(),
  prefetch: vi.fn(),
  recommendations: vi.fn(),
}));
vi.mock("../.open-next/worker.js", () => ({ default: { fetch: mocks.delegate } }));
vi.mock("./cron/fetch", () => ({ fetchAllFeeds: mocks.fetchAll }));
vi.mock("./cron/recommendations", () => ({ runRecommendationPush: mocks.recommendations }));
vi.mock("./lib/cron-prefetch", () => ({ runCronPrefetch: mocks.prefetch }));
import worker from "../worker";

function workerRequest(input: string, init?: RequestInit): Parameters<typeof worker.fetch>[0] {
  return new Request(input, init) as Parameters<typeof worker.fetch>[0];
}

const env = {
  RSS_FEED_WRITES_PAUSED: "true",
  RSS_DATA: {},
  RATE_LIMIT: {},
  FINDME_RSS: {},
  ARTICLE_SEARCH: {},
} as unknown as CloudflareEnv;
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.delegate.mockImplementation(async () => new Response("delegated", { status: 202 }));
  mocks.fetchAll.mockResolvedValue(undefined);
  mocks.prefetch.mockResolvedValue(undefined);
  mocks.recommendations.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("Worker maintenance boundary", () => {
  it("keeps existing prefetch running if recommendation setup fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.recommendations.mockRejectedValueOnce(new Error("R2 unavailable"));
    await worker.scheduled(
      {} as ScheduledController,
      { ...env, RSS_FEED_WRITES_PAUSED: "false" },
      ctx,
    );
    expect(mocks.prefetch).toHaveBeenCalledOnce();
    log.mockRestore();
  });
  it.each([
    ["POST", "/api/feeds"],
    ["POST", "/api/feeds/import"],
    ["POST", "/api/feeds/refresh"],
    ["POST", "/api/feeds/abc/refresh"],
    ["POST", "/api/feeds/abc/reinfer"],
    ["PATCH", "/api/feeds/abc"],
    ["DELETE", "/api/feeds/abc"],
    ["POST", "/api/feeds/abc/purge-content-cache"],
    ["POST", "/api/test/seed"],
    ["DELETE", "/api/test/seed"],
  ])(
    "blocks %s %s before the generated handler or any storage/network work",
    async (method, path) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const response = await worker.fetch(
        workerRequest(`https://rss.example.com${path}`, { method }),
        env,
        ctx,
      );
      expect(response.status).toBe(503);
      expect(mocks.delegate).not.toHaveBeenCalled();
      expect(mocks.fetchAll).not.toHaveBeenCalled();
      expect(mocks.prefetch).not.toHaveBeenCalled();
      expect(mocks.recommendations).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GET", "/api/feeds"],
    ["GET", "/api/articles"],
    ["POST", "/api/auth/logout"],
  ])("preserves delegation for %s %s while paused", async (method, path) => {
    const request = workerRequest(`https://rss.example.com${path}`, { method });
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(202);
    expect(mocks.delegate).toHaveBeenCalledWith(request, env, ctx);
    expect(mocks.delegate.mock.contexts[0]).toBe(worker);
  });
  it.each([undefined, "false"])(
    "preserves unpaused request/context/body forwarding (%s)",
    async (flag) => {
      const request = workerRequest("https://rss.example.com/api/feeds", {
        method: "POST",
        body: '{"url":"https://example.com/feed"}',
      });
      const unpausedEnv = { ...env, RSS_FEED_WRITES_PAUSED: flag };
      const response = await worker.fetch(request, unpausedEnv, ctx);
      expect(response.status).toBe(202);
      expect(mocks.delegate).toHaveBeenCalledWith(request, unpausedEnv, ctx);
      expect(mocks.delegate.mock.contexts[0]).toBe(worker);
      expect(await request.text()).toBe('{"url":"https://example.com/feed"}');
    },
  );
  it.each(["true", "unknown", ""])(
    "skips scheduled fetch and prefetch while paused (%s)",
    async (flag) => {
      await worker.scheduled(
        {} as ScheduledController,
        { ...env, RSS_FEED_WRITES_PAUSED: flag },
        ctx,
      );
      expect(mocks.fetchAll).not.toHaveBeenCalled();
      expect(mocks.prefetch).not.toHaveBeenCalled();
      expect(mocks.recommendations).not.toHaveBeenCalled();
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "false", "true"])(
    "forwards rollout gates to scheduled fetch (%s)",
    async (rollout) => {
      const unpausedEnv = {
        ...env,
        RSS_FEED_WRITES_PAUSED: "false",
        RSS_ARTICLE_STORAGE_V2: rollout,
        RSS_ARTICLE_SEARCH_INDEX: rollout,
      };
      await worker.scheduled({} as ScheduledController, unpausedEnv, ctx);
      expect(mocks.fetchAll).toHaveBeenCalledWith({
        RSS_DATA: env.RSS_DATA,
        RATE_LIMIT: env.RATE_LIMIT,
        FINDME_RSS: env.FINDME_RSS,
        ARTICLE_SEARCH: env.ARTICLE_SEARCH,
        RSS_FEED_WRITES_PAUSED: "false",
        RSS_ARTICLE_STORAGE_V2: rollout,
        RSS_ARTICLE_SEARCH_INDEX: rollout,
      });
      expect(mocks.prefetch).toHaveBeenCalledWith(
        { RSS_DATA: env.RSS_DATA, RATE_LIMIT: env.RATE_LIMIT },
        ctx,
      );
      expect(mocks.fetchAll.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.prefetch.mock.invocationCallOrder[0],
      );
      expect(ctx.waitUntil).toHaveBeenCalledWith(mocks.prefetch.mock.results[0].value);
    },
  );
});
