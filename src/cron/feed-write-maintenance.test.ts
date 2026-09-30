// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllFeeds,
  fetchAndUpdateSharedFeed,
  fetchArticles,
  fetchSingleFeed,
  registerAndFetchFeed,
} from "./fetch";
import { FeedWritesPausedError } from "../lib/feed-write-maintenance";

afterEach(() => vi.unstubAllGlobals());

function pausedEnv(value = "true") {
  const unexpectedBindingAccess = new Proxy(
    {},
    {
      get() {
        throw new Error("Binding touched during maintenance");
      },
    },
  );
  return {
    RSS_DATA: unexpectedBindingAccess as R2Bucket,
    RATE_LIMIT: unexpectedBindingAccess as KVNamespace,
    FINDME_RSS: unexpectedBindingAccess as Fetcher,
    ARTICLE_SEARCH: unexpectedBindingAccess as D1Database,
    RSS_FEED_WRITES_PAUSED: value,
  };
}

describe("direct feed ingestion maintenance guard", () => {
  it.each(["true", "invalid"])(
    "direct cron exits before binding/network access (%s)",
    async (value) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(fetchAllFeeds(pausedEnv(value))).resolves.toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    [
      "shared-feed update",
      (env: ReturnType<typeof pausedEnv>) => fetchAndUpdateSharedFeed(env, "feed", true),
    ],
    ["bulk refresh", (env: ReturnType<typeof pausedEnv>) => fetchArticles(env, "user")],
    ["single refresh", (env: ReturnType<typeof pausedEnv>) => fetchSingleFeed(env, "user", "feed")],
    [
      "registration",
      (env: ReturnType<typeof pausedEnv>) => registerAndFetchFeed(env, "https://example.com/feed"),
    ],
  ] as const)("%s rejects before binding/network access", async (_label, invoke) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(invoke(pausedEnv())).rejects.toBeInstanceOf(FeedWritesPausedError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
