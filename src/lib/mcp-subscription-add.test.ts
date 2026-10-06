// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserSubscription } from "../types";
import { computeFeedHash } from "./shared-feed";
import {
  createMcpSubscriptionAdder,
  MCP_SUBSCRIPTION_ADD_LIMITS,
  mcpSubscriptionAddSchema,
  normalizePublicFeedUrl,
  parsePublicFeed,
} from "./mcp-subscription-add";

const USER = "reader-one";
const SUBS = `users/${USER}/subscriptions.json`;
const URL = "https://publisher.com/feed.xml";
const RSS =
  '<rss version="2.0"><channel><title>Public feed</title><link>https://publisher.com/</link><description>News</description><item><title>Item</title><link>https://publisher.com/item</link></item></channel></rss>';
const ATOM =
  '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom feed</title><id>urn:feed:public</id><updated>2026-10-06T00:00:00Z</updated><link rel="alternate" href="https://publisher.com/"/><entry><title>Item</title><id>urn:item:1</id><updated>2026-10-06T00:00:00Z</updated></entry></feed>';
const JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON feed",
  home_page_url: "https://publisher.com/",
  items: [{ id: "one", content_text: "Public text" }],
});

function fixture() {
  const store = new Map<string, { body: string; etag: string; size?: number }>();
  let revision = 0;
  const seed = (key: string, value: unknown) => {
    store.set(key, { body: JSON.stringify(value), etag: String(++revision) });
  };
  seed(SUBS, []);
  const get = vi.fn(async (key: string) => {
    const stored = store.get(key);
    if (!stored) return null;
    const bytes = new TextEncoder().encode(stored.body);
    return {
      size: stored.size ?? bytes.byteLength,
      etag: stored.etag,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      json: async () => JSON.parse(stored.body) as unknown,
      text: async () => stored.body,
    };
  });
  let beforeConditionalPut: ((key: string) => void) | undefined;
  const put = vi.fn(async (key: string, body: string, options?: R2PutOptions) => {
    beforeConditionalPut?.(key);
    const current = store.get(key);
    const condition = options?.onlyIf as R2Conditional | undefined;
    if (condition?.etagMatches && condition.etagMatches !== current?.etag) return null;
    if (condition?.etagDoesNotMatch === "*" && current) return null;
    const etag = String(++revision);
    store.set(key, { body, etag });
    return { etag };
  });
  const bucket = { get, put } as unknown as R2Bucket;
  const kvValues = new Map<string, string>();
  const kvGet = vi.fn(async (key: string) => kvValues.get(key) ?? null);
  const kvPut = vi.fn(async (key: string, value: string) => {
    kvValues.set(key, value);
  });
  const kv = { get: kvGet, put: kvPut, delete: vi.fn() } as unknown as KVNamespace;
  const env: Pick<CloudflareEnv, "RSS_DATA" | "RATE_LIMIT" | "RSS_FEED_WRITES_PAUSED"> = {
    RSS_DATA: bucket,
    RATE_LIMIT: kv,
    RSS_FEED_WRITES_PAUSED: undefined,
  };
  const assertAuthorized = vi.fn(async () => {});
  const afterCommit = vi.fn(async () => {});
  const onExisting = vi.fn(async () => {});
  const adder = createMcpSubscriptionAdder(env, USER, {
    assertAuthorized,
    afterCommit,
    onExisting,
  });
  const fetch = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(RSS, { headers: { "Content-Type": "application/rss+xml" } }),
  );
  vi.stubGlobal("fetch", fetch);
  return {
    env,
    store,
    seed,
    get,
    put,
    kvGet,
    kvPut,
    assertAuthorized,
    afterCommit,
    onExisting,
    adder,
    fetch,
    readSubscriptions: () => JSON.parse(store.get(SUBS)!.body) as UserSubscription[],
    setBeforeConditionalPut: (action: (key: string) => void) => {
      beforeConditionalPut = action;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("strict public-feed URL policy", () => {
  it("does not echo caller-controlled unknown keys in SDK validation messages", async () => {
    const result = await mcpSubscriptionAddSchema["~standard"].validate({
      url: URL,
      SYNTHETIC_SECRET_FIELD: "secret",
    });
    expect(result.issues?.map((issue) => issue.message).join(",")).not.toContain(
      "SYNTHETIC_SECRET_FIELD",
    );
    expect(result.issues).toBeDefined();
  });
  it("only normalizes proven URL semantics", () => {
    expect(normalizePublicFeedUrl("HTTPS://Publisher.COM:443/Feed.xml")).toBe(
      "https://publisher.com/Feed.xml",
    );
    expect(normalizePublicFeedUrl("https://publisher.com/feed.xml")).toBe(URL);
    expect(normalizePublicFeedUrl("https://publisher.com/Feed.xml")).not.toBe(URL);
  });

  it("rejects default and configured RSSHub hosts rather than enabling later credential-assisted cron fetches", () => {
    vi.stubEnv("RSSHUB_INSTANCE_URL", "https://aggregator.com/base");
    for (const url of ["https://rsshub.app/twitter/user/test", "https://aggregator.com/feed.xml"])
      expect(normalizePublicFeedUrl(url)).toBeNull();
    expect(normalizePublicFeedUrl(URL)).toBe(URL);
  });

  it.each([
    "http://publisher.com/feed",
    "https://user:secret@publisher.com/feed",
    "https://publisher.com:444/feed",
    "https://publisher.com/feed#section",
    "https://publisher.com/feed?token=secret",
    "https://publisher.com/feed?format=rss",
    "https://localhost/feed",
    "https://localhost./feed",
    "https://myserver/feed",
    "https://service.internal/feed",
    "https://127.0.0.1/feed",
    "https://2130706433/feed",
    "https://0x7f000001/feed",
    "https://0177.0.0.1/feed",
    "https://10.0.0.1/feed",
    "https://169.254.169.254/feed",
    "https://100.64.0.1/feed",
    "https://192.0.2.1/feed",
    "https://224.0.0.1/feed",
    "https://[::1]/feed",
    "https://[::ffff:7f00:1]/feed",
    "https://[2001:db8::1]/feed",
    "https://publisher.com/token/secret/feed",
    "https://publisher.com/secret-feed/feed",
    "https://publisher.com/%74oken/secret/feed",
    "https://publisher.com/%2574oken/secret/feed",
    "https://publisher.com/feed%ZZ",
    "https://publisher.com/feed%00.xml",
    "https://publisher.com/0123456789abcdef0123456789abcdef/feed",
    " https://publisher.com/feed",
    "https://publisher.com\\feed",
    "https://publisher.com/feed\n",
    "https://publisher.com/feed?",
    "https://publisher.com/feed#",
    "not-a-url",
  ])("rejects unsafe, ambiguous or credential-bearing input %s", (url) => {
    expect(normalizePublicFeedUrl(url)).toBeNull();
  });

  it("allows only the exact official YouTube channel query route", () => {
    const youtube = "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv";
    expect(normalizePublicFeedUrl(youtube)).toBe(youtube);
    for (const url of [
      youtube + "&token=secret",
      youtube + "&channel_id=UCabcdefghijklmnopqrstuv",
      youtube.replace("www.youtube.com", "youtube.com.evil.com"),
      youtube.replace("videos.xml", "other.xml"),
    ]) {
      expect(normalizePublicFeedUrl(url)).toBeNull();
    }
  });
});

describe("bounded actual feed validation", () => {
  it.each([RSS, ATOM, JSON_FEED])("accepts a structurally valid public feed", (body) => {
    expect(parsePublicFeed(body, URL)).toMatchObject({ siteUrl: "https://publisher.com/" });
  });

  it.each([
    "<html><head><title>Not a feed</title></head></html>",
    "<rss><channel/></rss>",
    '<rss version="2.0"><channel><title>Bad</title></channel></rss>',
    '<rss version="2.0"><channel><title>T</title><link>https://publisher.com/</link><description>D</description></rss>',
    "<feed><title>Fake Atom</title><id>one</id><updated>2026-10-06T00:00:00Z</updated></feed>",
    '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///private">]>' + RSS,
    '<!DOCTYPE rss [<!ENTITY a "x"><!ENTITY b "&a;&a;&a;">]>' + RSS,
    JSON.stringify({
      version: "https://jsonfeed.org.evil.com/version/1.1",
      title: "Fake",
      items: [],
    }),
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Fake",
      items: [{ id: "one" }],
    }),
    JSON.stringify({ version: "https://jsonfeed.org/version/1.1", title: "Fake", items: "wrong" }),
    JSON.stringify({ version: ["https://jsonfeed.org/version/1.1"], title: "Fake", items: [] }),
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: { "#text": "Fake" },
      items: [],
    }),
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Fake",
      items: [{ id: { "#text": "one" }, content_text: "Text" }],
    }),
    "{ malformed",
    "",
  ])("rejects non-feeds, spoofed structures and unsafe parser input", (body) => {
    expect(() => parsePublicFeed(body, URL)).toThrow();
  });

  it("rejects excessive XML and JSON nesting and item counts", () => {
    const nestedXml = RSS.replace(
      "<title>Public feed</title>",
      "<title>" + "<x>".repeat(40) + "text" + "</x>".repeat(40) + "</title>",
    );
    const nestedJson =
      '{"version":"https://jsonfeed.org/version/1.1","title":"Title","items":[],"extra":' +
      "[".repeat(40) +
      "0" +
      "]".repeat(40) +
      "}";
    const manyItems = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Title",
      items: Array.from({ length: MCP_SUBSCRIPTION_ADD_LIMITS.maxFeedItems + 1 }, () => ({
        id: "one",
        content_text: "Text",
      })),
    });
    for (const body of [nestedXml, nestedJson, manyItems])
      expect(() => parsePublicFeed(body, URL)).toThrow();
  });

  it("never uses feed self links to change canonical identity or expose unsafe site URLs", () => {
    const atom = ATOM.replace(
      '<link rel="alternate" href="https://publisher.com/"/>',
      '<link rel="self" href="https://other.com/feed"/><link rel="alternate" href="https://user:secret@publisher.com/private?token=secret"/>',
    );
    expect(parsePublicFeed(atom, URL).siteUrl).toBe("https://publisher.com/");
  });
});

describe("additive public-feed MCP service", () => {
  it("rejects a configured RSSHub URL before storage/cooldown/fetch", async () => {
    vi.stubEnv("RSSHUB_INSTANCE_URL", "https://aggregator.com");
    const f = fixture();
    expect(await f.adder.addSubscription({ url: "https://aggregator.com/feed.xml" })).toEqual({
      status: "invalid_url",
      retryable: false,
    });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.kvGet).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("rejects a redirect to the configured RSSHub origin before fetching it", async () => {
    vi.stubEnv("RSSHUB_INSTANCE_URL", "https://aggregator.com");
    const f = fixture();
    f.fetch.mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://aggregator.com/feed.xml" },
        }),
    );
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "invalid_url",
      retryable: false,
    });
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.put).not.toHaveBeenCalled();
  });

  it("durably adds one minimal owner-bound subscription and supplies safe commit effects", async () => {
    const f = fixture();
    const result = await f.adder.addSubscription({ url: URL });
    const feedHash = await computeFeedHash(URL);
    expect(result).toMatchObject({
      status: "added",
      feedId: feedHash,
      canonicalUrl: URL,
      subscriptionCommitted: true,
    });
    expect(f.readSubscriptions()).toEqual([
      { feedHash, url: URL, subscribedAt: expect.any(String), lastAccessedAt: expect.any(String) },
    ]);
    expect(f.assertAuthorized).toHaveBeenCalled();
    expect(f.afterCommit).toHaveBeenCalledExactlyOnceWith({
      feedHash,
      url: URL,
      title: "Public feed",
      siteUrl: "https://publisher.com/",
    });
    expect(f.put.mock.calls.every(([, , options]) => !!options?.onlyIf)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Public text");
  });

  it.each(["userId", "cookie", "headers", "token", "cssSelector", "useRsshub", "storageKey"])(
    "rejects extra argument %s before bindings or fetch",
    async (key) => {
      const f = fixture();
      expect(await f.adder.addSubscription({ url: URL, [key]: "untrusted-secret" })).toEqual({
        status: "invalid_url",
        retryable: false,
      });
      expect(f.get).not.toHaveBeenCalled();
      expect(f.fetch).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
    },
  );

  it("returns existing before cooldown/network, preserving every existing setting", async () => {
    const f = fixture();
    const original: UserSubscription = {
      feedHash: await computeFeedHash(URL),
      url: URL,
      subscribedAt: "2020-01-01T00:00:00Z",
      customTitle: "My title",
      nsfw: true,
      priority: "high",
      category: "Reading",
      mutedUntil: "2027-01-01T00:00:00Z",
      filter: { include: ["x"], exclude: ["y"] },
      digestLimit: 7,
    };
    f.seed(SUBS, [original]);
    expect(
      await f.adder.addSubscription({ url: "HTTPS://Publisher.COM:443/feed.xml" }),
    ).toMatchObject({ status: "already_subscribed", feedId: original.feedHash });
    expect(f.readSubscriptions()).toEqual([original]);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.kvPut).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  });

  it("stores only verified redirect aliases and makes original URL retries idempotent", async () => {
    const f = fixture();
    f.fetch.mockImplementationOnce(
      async () => new Response(null, { status: 302, headers: { Location: "/canonical.xml" } }),
    );
    const final = "https://publisher.com/canonical.xml";
    expect(await f.adder.addSubscription({ url: URL })).toMatchObject({
      status: "added",
      canonicalUrl: final,
    });
    expect(f.readSubscriptions()[0]).toMatchObject({ url: final, publicFeedAliases: [URL] });
    expect(await f.adder.addSubscription({ url: URL })).toMatchObject({
      status: "already_subscribed",
      canonicalUrl: final,
    });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not use self links or common site origins for duplicate suppression", async () => {
    const f = fixture();
    f.seed(SUBS, [
      {
        feedHash: await computeFeedHash("https://publisher.com/other.xml"),
        url: "https://publisher.com/other.xml",
        subscribedAt: "2020-01-01T00:00:00Z",
      },
    ]);
    f.fetch.mockImplementation(
      async () =>
        new Response(
          ATOM.replace(
            "<title>Atom feed</title>",
            '<title>Atom feed</title><link rel="self" href="https://publisher.com/other.xml"/>',
          ),
        ),
    );
    expect(await f.adder.addSubscription({ url: URL })).toMatchObject({
      status: "added",
      canonicalUrl: URL,
    });
    expect(f.readSubscriptions()).toHaveLength(2);
  });

  it.each([
    "https://127.0.0.1/feed",
    "http://publisher.com/feed",
    "https://user:secret@publisher.com/feed",
    "https://publisher.com/feed?token=secret",
  ])("blocks redirect destination before it is fetched: %s", async (location) => {
    const f = fixture();
    f.fetch.mockImplementation(
      async () => new Response(null, { status: 302, headers: { Location: location } }),
    );
    const result = await f.adder.addSubscription({ url: URL });
    expect(["invalid_url", "unsupported_feed"]).toContain(result.status);
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.put).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("never forwards credentials, user identity, headers, cookies or service-specific keys", async () => {
    const f = fixture();
    await f.adder.addSubscription({ url: URL });
    const init = f.fetch.mock.calls[0][1] as RequestInit | undefined;
    expect(init).toMatchObject({ redirect: "manual", credentials: "omit", method: "GET" });
    const headers = new Headers(init?.headers);
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
    expect(JSON.stringify(init)).not.toContain(USER);
  });

  it("requires actual feed structure despite a feed MIME type and performs no fallback fetch", async () => {
    const f = fixture();
    f.fetch.mockImplementation(
      async () =>
        new Response("<html>not a feed</html>", {
          headers: { "Content-Type": "application/rss+xml" },
        }),
    );
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "unsupported_feed",
      retryable: false,
    });
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.put).not.toHaveBeenCalled();
  });

  it("rejects oversized actual bytes despite an underreported Content-Length", async () => {
    const f = fixture();
    f.fetch.mockImplementation(
      async () =>
        new Response("x".repeat(MCP_SUBSCRIPTION_ADD_LIMITS.maxFeedBytes + 1), {
          headers: { "Content-Length": "1" },
        }),
    );
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "unsupported_feed",
      retryable: false,
    });
    expect(f.put).not.toHaveBeenCalled();
  });

  it("bounds redirects and does not write on redirect loops", async () => {
    const f = fixture();
    let hop = 0;
    f.fetch.mockImplementation(
      async () => new Response(null, { status: 302, headers: { Location: `/hop-${++hop}` } }),
    );
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("unsupported_feed");
    expect(f.fetch).toHaveBeenCalledTimes(5);
    expect(f.put).not.toHaveBeenCalled();
  });

  it("maintenance fails closed before any binding/network access", async () => {
    const f = fixture();
    f.env.RSS_FEED_WRITES_PAUSED = "true";
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "maintenance_paused",
      retryable: true,
    });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  });

  it("rechecks revocation before committing and never appends after revocation", async () => {
    const f = fixture();
    let revoked = false;
    f.assertAuthorized.mockImplementation(async () => {
      if (revoked) throw new Error("revoked");
    });
    f.fetch.mockImplementation(async () => {
      revoked = true;
      return new Response(RSS);
    });
    await expect(f.adder.addSubscription({ url: URL })).rejects.toThrow("revoked");
    expect(f.readSubscriptions()).toEqual([]);
    expect(f.afterCommit).not.toHaveBeenCalled();
  });

  it("rechecks maintenance before conditional commit", async () => {
    const f = fixture();
    f.fetch.mockImplementation(async () => {
      f.env.RSS_FEED_WRITES_PAUSED = "true";
      return new Response(RSS);
    });
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "maintenance_paused",
      retryable: true,
    });
    expect(f.readSubscriptions()).toEqual([]);
    expect(f.afterCommit).not.toHaveBeenCalled();
  });

  it("respects the existing 30-second add cooldown for distinct new feeds", async () => {
    const f = fixture();
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("added");
    expect(await f.adder.addSubscription({ url: "https://otherpublisher.com/feed" })).toMatchObject(
      { status: "cooldown", retryable: true },
    );
    expect(f.fetch).toHaveBeenCalledOnce();
  });

  it.each(["invalid", "NaN", "-1", "1.5", "9".repeat(100), String(Number.MAX_SAFE_INTEGER)])(
    "fails closed on corrupt cooldown timestamps without network work: %s",
    async (value) => {
      const f = fixture();
      f.kvGet.mockResolvedValue(value);
      expect(await f.adder.addSubscription({ url: URL })).toEqual({
        status: "storage_unavailable",
        retryable: true,
      });
      expect(f.fetch).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
    },
  );

  it("fails closed on subscription, metadata and cooldown storage outages", async () => {
    const subscriptions = fixture();
    subscriptions.get.mockRejectedValue(new Error("private-key secret"));
    expect(await subscriptions.adder.addSubscription({ url: URL })).toEqual({
      status: "storage_unavailable",
      retryable: true,
    });
    expect(subscriptions.fetch).not.toHaveBeenCalled();
    const cooldown = fixture();
    cooldown.kvGet.mockRejectedValue(new Error("private-key secret"));
    expect(await cooldown.adder.addSubscription({ url: URL })).toEqual({
      status: "storage_unavailable",
      retryable: true,
    });
    expect(cooldown.fetch).not.toHaveBeenCalled();
    const metadata = fixture();
    const original = metadata.get.getMockImplementation()!;
    metadata.get.mockImplementation(async (key) => {
      if (key.startsWith("feeds/")) throw new Error("private-key secret");
      return original(key);
    });
    expect(await metadata.adder.addSubscription({ url: URL })).toEqual({
      status: "storage_unavailable",
      retryable: true,
    });
    expect(metadata.readSubscriptions()).toEqual([]);
  });

  it("bounds header wait and stalled feed bodies without writing", async () => {
    vi.useFakeTimers();
    const network = fixture();
    network.fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        }),
    );
    const resolving = network.adder.addSubscription({ url: URL });
    await vi.advanceTimersByTimeAsync(MCP_SUBSCRIPTION_ADD_LIMITS.fetchTimeoutMs);
    expect(await resolving).toMatchObject({ status: "unsupported_feed", retryable: true });
    expect(network.put).not.toHaveBeenCalled();
    const body = fixture();
    const cancel = vi.fn();
    body.fetch.mockImplementation(async () => new Response(new ReadableStream({ cancel })));
    const reading = body.adder.addSubscription({ url: URL });
    await vi.advanceTimersByTimeAsync(MCP_SUBSCRIPTION_ADD_LIMITS.fetchTimeoutMs);
    expect(await reading).toMatchObject({ status: "unsupported_feed", retryable: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.put).not.toHaveBeenCalled();
  });

  it("an existing feed remains idempotent at capacity while a new one is rejected", async () => {
    const f = fixture();
    const existing = {
      feedHash: await computeFeedHash(URL),
      url: URL,
      subscribedAt: "2020-01-01T00:00:00Z",
    };
    f.seed(SUBS, [
      existing,
      ...Array.from({ length: 999 }, (_, index) => ({
        feedHash: index.toString(16).padStart(16, "0"),
        url: `https://publisher.com/feed-${index}`,
        subscribedAt: "2020-01-01T00:00:00Z",
      })),
    ]);
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("already_subscribed");
    expect((await f.adder.addSubscription({ url: "https://otherpublisher.com/feed" })).status).toBe(
      "limit_reached",
    );
    expect(f.readSubscriptions()).toHaveLength(1000);
    expect(f.put).not.toHaveBeenCalled();
  });

  it("retries CAS against the fresh snapshot and preserves concurrent additions", async () => {
    const f = fixture();
    const concurrent = {
      feedHash: "1234567890abcdef",
      url: "https://otherpublisher.com/feed",
      subscribedAt: "2020-01-01T00:00:00Z",
      customTitle: "Concurrent",
    };
    let conflicted = false;
    f.setBeforeConditionalPut((key) => {
      if (key === SUBS && !conflicted) {
        conflicted = true;
        f.seed(SUBS, [concurrent]);
      }
    });
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("added");
    expect(f.readSubscriptions()).toHaveLength(2);
    expect(f.readSubscriptions()[0]).toEqual(concurrent);
    expect(f.fetch).toHaveBeenCalledOnce();
  });

  it("returns existing rather than a second append after a same-feed conflict", async () => {
    const f = fixture();
    const concurrent = {
      feedHash: await computeFeedHash(URL),
      url: URL,
      subscribedAt: "2020-01-01T00:00:00Z",
      customTitle: "Concurrent",
    };
    let conflicted = false;
    f.setBeforeConditionalPut((key) => {
      if (key === SUBS && !conflicted) {
        conflicted = true;
        f.seed(SUBS, [concurrent]);
      }
    });
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("already_subscribed");
    expect(f.readSubscriptions()).toEqual([concurrent]);
  });

  it("reports exhausted CAS conflicts without claiming a committed addition", async () => {
    const f = fixture();
    f.setBeforeConditionalPut((key) => {
      if (key === SUBS) f.seed(SUBS, f.readSubscriptions());
    });
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "retryable_conflict",
      retryable: true,
    });
    expect(f.readSubscriptions()).toEqual([]);
    expect(f.afterCommit).not.toHaveBeenCalled();
  });

  it("rechecks the current limit after a conditional-write conflict", async () => {
    const f = fixture();
    let conflicted = false;
    f.setBeforeConditionalPut((key) => {
      if (key === SUBS && !conflicted) {
        conflicted = true;
        f.seed(
          SUBS,
          Array.from({ length: 1000 }, (_, index) => ({
            feedHash: index.toString(16).padStart(16, "0"),
            url: `https://publisher.com/feed-${index}`,
            subscribedAt: "2020-01-01T00:00:00Z",
          })),
        );
      }
    });
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "limit_reached",
      retryable: false,
    });
    expect(f.readSubscriptions()).toHaveLength(1000);
    expect(f.afterCommit).not.toHaveBeenCalled();
  });

  it("does not interpret corrupt/oversized subscription storage as an empty list", async () => {
    for (const invalid of ["broken-json", JSON.stringify({ subscriptions: [] })]) {
      const f = fixture();
      f.store.set(SUBS, { body: invalid, etag: "broken" });
      expect((await f.adder.addSubscription({ url: URL })).status).toBe("storage_unavailable");
      expect(f.fetch).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
    }
  });

  it("does not trust unsafe or unbounded stored aliases", async () => {
    const f = fixture();
    f.seed(SUBS, [
      {
        feedHash: "1234567890abcdef",
        url: "https://otherpublisher.com/feed",
        subscribedAt: "2020-01-01T00:00:00Z",
        publicFeedAliases: [URL, "https://user:secret@publisher.com/private"],
      },
    ]);
    const result = await f.adder.addSubscription({ url: URL });
    expect(result.status).not.toBe("already_subscribed");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects existing inferred or corrupt metadata before appending", async () => {
    for (const extra of [
      { cssSelectors: { articleLink: "a", model: "manual", generatedAt: "2020-01-01T00:00:00Z" } },
      { url: "https://otherpublisher.com/feed" },
    ]) {
      const f = fixture();
      const feedHash = await computeFeedHash(URL);
      f.seed(`feeds/${feedHash}/meta.json`, {
        feedHash,
        url: URL,
        title: "Existing",
        siteUrl: "https://publisher.com/",
        lastFetchedAt: null,
        fetchError: null,
        articleCount: 0,
        pageCount: 0,
        ...extra,
      });
      expect(["unsupported_feed", "storage_unavailable"]).toContain(
        (await f.adder.addSubscription({ url: URL })).status,
      );
      expect(f.readSubscriptions()).toEqual([]);
    }
  });

  it("preserves existing official shared metadata rather than resetting its articles/settings", async () => {
    const f = fixture();
    const feedHash = await computeFeedHash(URL);
    const key = `feeds/${feedHash}/meta.json`;
    f.seed(key, {
      feedHash,
      url: URL,
      title: "Existing title",
      siteUrl: "https://publisher.com/",
      lastFetchedAt: "2026-10-06T00:00:00Z",
      fetchError: null,
      articleCount: 25,
      pageCount: 3,
      knownIds: ["one", "two"],
      etag: "publisher-etag",
    });
    const original = f.store.get(key)!.body;
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("added");
    expect(f.store.get(key)!.body).toBe(original);
    expect(f.put.mock.calls.some(([path]) => path === key)).toBe(false);
  });

  it("does not overwrite corrupt or oversized shared metadata", async () => {
    for (const object of [
      { body: "broken-json", size: 12 },
      { body: "{}", size: MCP_SUBSCRIPTION_ADD_LIMITS.maxMetaBytes + 1 },
    ]) {
      const f = fixture();
      const feedHash = await computeFeedHash(URL);
      const key = `feeds/${feedHash}/meta.json`;
      f.store.set(key, { ...object, etag: "original" });
      expect(await f.adder.addSubscription({ url: URL })).toEqual({
        status: "storage_unavailable",
        retryable: true,
      });
      expect(f.store.get(key)!.body).toBe(object.body);
      expect(f.readSubscriptions()).toEqual([]);
      expect(f.put).not.toHaveBeenCalled();
    }
  });

  it("re-reads shared metadata after a conditional-create race and rejects inferred format", async () => {
    const f = fixture();
    const feedHash = await computeFeedHash(URL);
    const key = `feeds/${feedHash}/meta.json`;
    let conflicted = false;
    f.setBeforeConditionalPut((path) => {
      if (path === key && !conflicted) {
        conflicted = true;
        f.seed(key, {
          feedHash,
          url: URL,
          title: "Inferred",
          siteUrl: "https://publisher.com/",
          lastFetchedAt: null,
          fetchError: null,
          articleCount: 0,
          pageCount: 0,
          cssSelectors: { articleLink: "a", model: "manual", generatedAt: "2020-01-01T00:00:00Z" },
        });
      }
    });
    expect(await f.adder.addSubscription({ url: URL })).toEqual({
      status: "unsupported_feed",
      retryable: false,
    });
    expect(f.readSubscriptions()).toEqual([]);
  });

  it("reports durable subscription but required repair when commit effects fail", async () => {
    const f = fixture();
    f.afterCommit.mockRejectedValueOnce(new Error("private storage key secret"));
    const result = await f.adder.addSubscription({ url: URL });
    expect(result).toMatchObject({
      status: "repair_required",
      subscriptionCommitted: true,
      retryable: true,
    });
    expect(f.readSubscriptions()).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect((await f.adder.addSubscription({ url: URL })).status).toBe("already_subscribed");
    expect(f.onExisting).toHaveBeenCalledOnce();
    expect(f.fetch).toHaveBeenCalledOnce();
  });
});
