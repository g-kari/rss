import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "../types";

vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));

import { apiFetch } from "../lib/api-fetch";
import { OGP_STAGGER_MS } from "../lib/ogp-cache-ttl";
import { STORAGE_KEYS } from "../lib/storage";
import { useOgpCache } from "./useOgpCache";

const mockApiFetch = vi.mocked(apiFetch);

function makeArticle(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    feedHash: "synthetic-feed",
    guid: id,
    title: `Article ${id}`,
    link: `https://articles.test/${id}`,
    summary: "",
    publishedAt: null,
    createdAt: "2026-10-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeArticles(count: number): Article[] {
  return Array.from({ length: count }, (_, i) => makeArticle(`article-${i}`));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function jsonResponse(image = "", status = 200): Response {
  return new Response(JSON.stringify({ image, title: "", description: "" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestLink(input: string): string {
  return new URL(input, "https://api.test").searchParams.get("url") ?? "";
}

function requestedLinks(): string[] {
  return mockApiFetch.mock.calls.map(([input]) => requestLink(input));
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function resolveRequest(request: ReturnType<typeof deferred<Response>>, image = "") {
  await act(async () => {
    request.resolve(jsonResponse(image));
  });
}

function renderCache(visible: Article[]) {
  return renderHook(({ articles }: { articles: Article[] }) => useOgpCache(articles), {
    initialProps: { articles: visible },
  });
}

// These host-specific strings exercise the existing BOOTH extraction rule only.
// Every request is synthetic and intercepted; the suite never contacts these hosts.
const boothLink = "https://synthetic-shop.booth.pm/items/synthetic-item";
const boothArticle = () =>
  makeArticle("booth-post", {
    link: "https://x.com/synthetic-account/status/synthetic-post",
    summary: `Synthetic product ${boothLink}`,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T00:00:00.000Z"));
  localStorage.clear();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(() => new Promise<Response>(() => {}));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real network calls are forbidden in the OGP queue suite");
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useOgpCache visible-link queue", () => {
  it("automatically drains every visible link beyond the first ten without another render", async () => {
    const articles = makeArticles(23);
    mockApiFetch.mockImplementation(async (input) =>
      jsonResponse(`https://images.test/${requestLink(input).split("/").at(-1)}.jpg`),
    );
    const { result } = renderCache(articles);

    await advance(OGP_STAGGER_MS * articles.length + 1000);

    expect(requestedLinks()).toEqual(articles.map((article) => article.link));
    expect(Object.keys(result.current.ogpCache)).toHaveLength(23);
    expect(result.current.ogpCache[articles[22].link]).toBe("https://images.test/article-22.jpg");
    // The long act batches cache updaters. Observe their final 500ms save separately.
    await advance(500);
    expect(
      Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEYS.OGP_CACHE) ?? "{}")),
    ).toHaveLength(23);
  });

  it("spaces primary starts by 150ms and keeps at most ten unresolved articles active", async () => {
    const articles = makeArticles(15);
    const requests: ReturnType<typeof deferred<Response>>[] = [];
    const starts: number[] = [];
    let active = 0;
    let maxActive = 0;
    mockApiFetch.mockImplementation(() => {
      const request = deferred<Response>();
      requests.push(request);
      starts.push(Date.now());
      active += 1;
      maxActive = Math.max(maxActive, active);
      return request.promise.finally(() => {
        active -= 1;
      });
    });
    const { result } = renderCache(articles);

    await advance(0);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    await advance(OGP_STAGGER_MS - 1);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    await advance(OGP_STAGGER_MS * 8);
    expect(mockApiFetch).toHaveBeenCalledTimes(10);
    expect(starts.map((start) => start - starts[0])).toEqual(
      Array.from({ length: 10 }, (_, i) => i * OGP_STAGGER_MS),
    );
    await advance(5000);
    expect(mockApiFetch).toHaveBeenCalledTimes(10);
    expect(active).toBe(10);

    await resolveRequest(requests[0], "https://images.test/first.jpg");
    await advance(OGP_STAGGER_MS);
    expect(mockApiFetch).toHaveBeenCalledTimes(11);
    expect(active).toBe(10);
    expect(maxActive).toBe(10);
    expect(result.current.ogpCache[articles[0].link]).toBe("https://images.test/first.jpg");
  });

  it("preserves the ten-slot limit when new visible targets are appended", async () => {
    const articles = makeArticles(10);
    const appended = makeArticle("appended");
    const requests: ReturnType<typeof deferred<Response>>[] = [];
    mockApiFetch.mockImplementation(() => {
      const request = deferred<Response>();
      requests.push(request);
      return request.promise;
    });
    const { rerender } = renderCache(articles);
    await advance(OGP_STAGGER_MS * 9);
    expect(mockApiFetch).toHaveBeenCalledTimes(10);
    const signals = mockApiFetch.mock.calls.map(([, init]) => init?.signal);
    rerender({ articles: [...articles, appended] });
    await advance(1000);

    expect(mockApiFetch).toHaveBeenCalledTimes(10);
    expect(signals.every((signal) => signal && !signal.aborted)).toBe(true);
    await resolveRequest(requests[0], "https://images.test/first.jpg");
    await advance(OGP_STAGGER_MS);
    expect(requestedLinks()).toEqual([...articles.map((article) => article.link), appended.link]);
  });

  it("deduplicates repeated links and equivalent visible-list rerenders", async () => {
    const first = makeArticle("first");
    const second = makeArticle("second");
    const { rerender } = renderCache([first, { ...first, id: "duplicate" }, second]);

    await advance(0);
    expect(requestedLinks()).toEqual([first.link]);
    rerender({ articles: [{ ...first }, { ...first, id: "duplicate-new" }, { ...second }] });
    await advance(OGP_STAGGER_MS);
    expect(requestedLinks()).toEqual([first.link, second.link]);
    rerender({ articles: [{ ...second }, { ...first, id: "last-id-changed" }] });
    await advance(1000);
    expect(requestedLinks()).toEqual([first.link, second.link]);
  });

  it("recognizes replacement links when list length and final article id stay the same", async () => {
    const old = makeArticle("old");
    const replacement = makeArticle("replacement");
    const sharedFinal = makeArticle("shared-final");
    const { rerender } = renderCache([old, sharedFinal]);

    await advance(0);
    rerender({ articles: [replacement, sharedFinal] });
    await advance(OGP_STAGGER_MS * 3);

    expect(requestedLinks()).toContain(replacement.link);
    expect(requestedLinks().filter((link) => link === sharedFinal.link)).toHaveLength(1);
    expect(requestedLinks().filter((link) => link === old.link)).toHaveLength(1);
  });

  it("keeps intersecting active work alive while canceling obsolete staggered targets", async () => {
    const shared = makeArticle("shared");
    const obsolete = makeArticle("obsolete-waiting");
    const replacement = makeArticle("replacement");
    const request = deferred<Response>();
    mockApiFetch.mockReturnValueOnce(request.promise);
    const { result, rerender } = renderCache([shared, obsolete]);
    await advance(0);
    const sharedSignal = mockApiFetch.mock.calls[0][1]?.signal;
    expect(sharedSignal).toBeInstanceOf(AbortSignal);
    rerender({ articles: [shared, replacement] });
    await advance(OGP_STAGGER_MS * 2);

    expect(sharedSignal?.aborted).toBe(false);
    expect(requestedLinks()).toEqual([shared.link, replacement.link]);
    await resolveRequest(request, "https://images.test/shared.jpg");
    expect(result.current.ogpCache[shared.link]).toBe("https://images.test/shared.jpg");
  });

  it("recognizes a changed link even when every article id is unchanged", async () => {
    const article = makeArticle("stable-id");
    const replacement = { ...article, link: "https://articles.test/replacement-link" };
    const { rerender } = renderCache([article]);

    await advance(0);
    rerender({ articles: [replacement] });
    await advance(OGP_STAGGER_MS * 2);

    expect(requestedLinks()).toEqual([article.link, replacement.link]);
  });

  it("releases canceled staggered work so those links can be fetched when visible again", async () => {
    const first = makeArticle("first");
    const waiting = makeArticle("waiting");
    const { rerender } = renderCache([first, waiting]);

    await advance(0);
    rerender({ articles: [] });
    await advance(1000);
    expect(requestedLinks()).toEqual([first.link]);
    rerender({ articles: [waiting] });
    await advance(OGP_STAGGER_MS);

    expect(requestedLinks()).toEqual([first.link, waiting.link]);
  });

  it("releases all obsolete active slots before ignored-abort responses settle", async () => {
    const obsolete = makeArticles(10);
    const replacement = makeArticle("replacement");
    const { rerender } = renderCache(obsolete);
    await advance(OGP_STAGGER_MS * 9);
    expect(requestedLinks()).toEqual(obsolete.map((article) => article.link));
    const signals = mockApiFetch.mock.calls.map(([, init]) => init?.signal);

    // The synthetic transport deliberately ignores abort and never settles.
    rerender({ articles: [replacement] });
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
    await advance(OGP_STAGGER_MS);

    expect(requestedLinks()).toEqual([
      ...obsolete.map((article) => article.link),
      replacement.link,
    ]);
  });

  it("restarts a canceled active link on revisit without waiting for its stale response", async () => {
    const article = makeArticle("revisited-active");
    const stale = deferred<Response>();
    mockApiFetch
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(jsonResponse("https://images.test/revisited.jpg"));
    const { result, rerender } = renderCache([article]);
    await advance(0);
    rerender({ articles: [] });
    rerender({ articles: [article] });
    await advance(OGP_STAGGER_MS);

    expect(requestedLinks()).toEqual([article.link, article.link]);
    expect(result.current.ogpCache[article.link]).toBe("https://images.test/revisited.jpg");
    await resolveRequest(stale, "https://images.test/stale.jpg");
    expect(result.current.ogpCache[article.link]).toBe("https://images.test/revisited.jpg");
  });

  it("ignores obsolete primary success without changing cache or storage", async () => {
    const article = makeArticle("obsolete");
    const request = deferred<Response>();
    mockApiFetch.mockReturnValueOnce(request.promise);
    const { result, rerender } = renderCache([article]);
    await advance(0);
    const signal = mockApiFetch.mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    rerender({ articles: [] });
    expect(signal?.aborted).toBe(true);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await resolveRequest(request, "https://images.test/obsolete.jpg");
    await advance(1000);

    expect(result.current.ogpCache[article.link]).toBeUndefined();
    expect(result.current.getEntry(article.link)).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not launch BOOTH fallback for a primary response after its article disappears", async () => {
    const article = boothArticle();
    const request = deferred<Response>();
    mockApiFetch.mockReturnValueOnce(request.promise);
    const { rerender } = renderCache([article]);
    await advance(0);
    rerender({ articles: [] });

    await resolveRequest(request);
    await advance(1000);

    expect(requestedLinks()).toEqual([article.link]);
  });

  it("ignores obsolete BOOTH fallback success and keeps a newly visible article independent", async () => {
    const article = boothArticle();
    const replacement = makeArticle("replacement");
    const fallback = deferred<Response>();
    mockApiFetch.mockResolvedValueOnce(jsonResponse()).mockReturnValueOnce(fallback.promise);
    const { result, rerender } = renderCache([article]);
    await advance(0);
    expect(requestedLinks()).toEqual([article.link, boothLink]);
    rerender({ articles: [replacement] });
    await advance(OGP_STAGGER_MS);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await resolveRequest(fallback, "https://images.test/obsolete-booth.jpg");
    await advance(1000);

    expect(requestedLinks()).toContain(replacement.link);
    expect(result.current.ogpCache[article.link]).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("cancels waiting starts on unmount and suppresses late empty-result fallback", async () => {
    const article = boothArticle();
    const waiting = makeArticle("waiting");
    const request = deferred<Response>();
    mockApiFetch.mockReturnValueOnce(request.promise);
    const { result, unmount } = renderCache([article, waiting]);
    await advance(0);
    unmount();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await resolveRequest(request);
    await advance(1000);

    expect(requestedLinks()).toEqual([article.link]);
    expect(result.current.getEntry(article.link)).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not persist a late successful primary or pending save after unmount", async () => {
    const article = makeArticle("late-image");
    const request = deferred<Response>();
    mockApiFetch.mockReturnValueOnce(request.promise);
    const { result, unmount } = renderCache([article]);
    await advance(0);
    const signal = mockApiFetch.mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    unmount();
    expect(signal?.aborted).toBe(true);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await resolveRequest(request, "https://images.test/late.jpg");
    await advance(1000);

    expect(result.current.getEntry(article.link)).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
    expect(requestedLinks()).toEqual([article.link]);
  });

  it("clears an already scheduled cache save when unmounted before debounce finishes", async () => {
    const article = makeArticle("pending-save");
    mockApiFetch.mockResolvedValueOnce(jsonResponse("https://images.test/pending-save.jpg"));
    const { result, unmount } = renderCache([article]);
    await advance(0);
    expect(result.current.ogpCache[article.link]).toBe("https://images.test/pending-save.jpg");
    expect(localStorage.getItem(STORAGE_KEYS.OGP_CACHE)).toBeNull();
    unmount();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await advance(1000);

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.OGP_CACHE)).toBeNull();
  });

  it("aborts an in-flight BOOTH fallback on unmount and ignores its late success", async () => {
    const article = boothArticle();
    const fallback = deferred<Response>();
    mockApiFetch.mockResolvedValueOnce(jsonResponse()).mockReturnValueOnce(fallback.promise);
    const { result, unmount } = renderCache([article]);
    await advance(0);
    expect(requestedLinks()).toEqual([article.link, boothLink]);
    const signal = mockApiFetch.mock.calls[1][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    unmount();
    expect(signal?.aborted).toBe(true);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await resolveRequest(fallback, "https://images.test/late-booth.jpg");
    await advance(1000);

    expect(result.current.getEntry(article.link)).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
    expect(requestedLinks()).toEqual([article.link, boothLink]);
  });

  it("remembers genuinely empty success for the session without persisting a negative image", async () => {
    const article = makeArticle("empty");
    mockApiFetch.mockResolvedValue(jsonResponse());
    const { result, rerender } = renderCache([article]);
    await advance(0);
    rerender({ articles: [] });
    rerender({ articles: [{ ...article, id: "empty-revisited" }] });
    await advance(1000);

    expect(requestedLinks()).toEqual([article.link]);
    expect(result.current.ogpCache[article.link]).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEYS.OGP_CACHE)).toBeNull();
  });

  it.each(["network", "server"])(
    "retries a transient %s failure only when the link is revisited",
    async (failure) => {
      const article = makeArticle(`transient-${failure}`);
      if (failure === "network") {
        mockApiFetch.mockRejectedValueOnce(new TypeError("Synthetic connection failure"));
      } else {
        mockApiFetch.mockResolvedValueOnce(jsonResponse("", 503));
      }
      mockApiFetch.mockResolvedValue(jsonResponse("https://images.test/recovered.jpg"));
      const { result, rerender } = renderCache([article]);
      await advance(1000);
      expect(requestedLinks()).toEqual([article.link]);
      expect(result.current.ogpCache[article.link]).toBeUndefined();
      rerender({ articles: [] });
      rerender({ articles: [{ ...article, id: "revisited" }] });
      await advance(1000);

      expect(requestedLinks()).toEqual([article.link, article.link]);
      expect(result.current.ogpCache[article.link]).toBe("https://images.test/recovered.jpg");
    },
  );

  it.each([401, 403, 429])(
    "does not retry or launch fallback automatically after HTTP %i",
    async (status) => {
      const article = boothArticle();
      mockApiFetch.mockResolvedValue(jsonResponse("", status));
      const { result } = renderCache([article]);

      await advance(10_000);

      expect(requestedLinks()).toEqual([article.link]);
      expect(result.current.ogpCache[article.link]).toBeUndefined();
    },
  );

  it.each(
    (["append", "reorder"] as const).flatMap((change) =>
      (["network", 503, 401, 403, 429] as const).map((failure) => ({ change, failure })),
    ),
  )(
    "does not retry continuously visible $failure failures on $change, but permits genuine revisit",
    async ({ change, failure }) => {
      const failed = makeArticle(`failed-${failure}`);
      const queued = makeArticle("queued-not-started");
      const additional = makeArticle("additional");
      let failedAttempts = 0;
      mockApiFetch.mockImplementation(async (input) => {
        const link = requestLink(input);
        if (link === failed.link && failedAttempts++ === 0) {
          if (failure === "network") throw new TypeError("Synthetic connection failure");
          const response = jsonResponse("", failure);
          if (failure === 429) response.headers.set("Retry-After", "1");
          return response;
        }
        return jsonResponse(`https://images.test/${link.split("/").at(-1)}.jpg`);
      });
      const initial = change === "append" ? [failed, queued] : [failed, queued, additional];
      const { result, rerender } = renderCache(initial);
      await advance(0);
      expect(requestedLinks()).toEqual([failed.link]);
      expect(result.current.ogpCache[failed.link]).toBeUndefined();

      const changed = change === "append" ? [...initial, additional] : [additional, failed, queued];
      rerender({ articles: changed });
      await advance(2000);

      expect(requestedLinks().filter((link) => link === failed.link)).toHaveLength(1);
      expect(result.current.ogpCache[failed.link]).toBeUndefined();
      // Attempt tracking must not classify queued-but-never-started links as failed attempts.
      expect(requestedLinks().filter((link) => link === queued.link)).toHaveLength(1);
      expect(requestedLinks().filter((link) => link === additional.link)).toHaveLength(1);
      expect(result.current.ogpCache[queued.link]).toBe(
        "https://images.test/queued-not-started.jpg",
      );
      expect(result.current.ogpCache[additional.link]).toBe("https://images.test/additional.jpg");

      rerender({ articles: [queued, additional, failed] });
      await advance(1000);
      expect(requestedLinks().filter((link) => link === failed.link)).toHaveLength(1);

      rerender({ articles: [queued, additional] });
      rerender({ articles: [failed, queued, additional] });
      await advance(OGP_STAGGER_MS);

      expect(requestedLinks().filter((link) => link === failed.link)).toHaveLength(2);
      expect(result.current.ogpCache[failed.link]).toBe(
        `https://images.test/failed-${failure}.jpg`,
      );
      expect(requestedLinks().filter((link) => link === queued.link)).toHaveLength(1);
      expect(requestedLinks().filter((link) => link === additional.link)).toHaveLength(1);
    },
  );

  it("pauses queued primary starts for Retry-After without retrying the rate-limited target", async () => {
    const articles = makeArticles(3);
    const limited = jsonResponse("", 429);
    limited.headers.set("Retry-After", "2");
    mockApiFetch
      .mockResolvedValueOnce(limited)
      .mockImplementation(async (input) =>
        jsonResponse(`https://images.test/${requestLink(input).split("/").at(-1)}.jpg`),
      );
    const { result, rerender } = renderCache(articles);
    await advance(0);
    expect(requestedLinks()).toEqual([articles[0].link]);
    // A new array with the same links must not reset the pause or retry a failed link.
    rerender({ articles: articles.map((article) => ({ ...article })) });
    await advance(1999);
    expect(requestedLinks()).toEqual([articles[0].link]);
    await advance(1);
    expect(requestedLinks()).toEqual([articles[0].link, articles[1].link]);
    await advance(OGP_STAGGER_MS);

    expect(requestedLinks()).toEqual(articles.map((article) => article.link));
    expect(result.current.ogpCache[articles[0].link]).toBeUndefined();
    expect(result.current.ogpCache[articles[2].link]).toBe("https://images.test/article-2.jpg");
  });

  it("does not request empty, relative, non-HTTP or private visible URLs", async () => {
    const invalidLinks = [
      "",
      "/relative-article",
      "not a URL",
      "javascript:synthetic()",
      "data:text/plain,synthetic",
      "http://127.0.0.1/synthetic",
      "https://localhost/synthetic",
      "https://192.168.1.1/synthetic",
      "https://[::1]/synthetic",
    ];
    renderCache(invalidLinks.map((link, i) => makeArticle(`invalid-${i}`, { link })));

    await advance(10_000);

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["non-string", { image: { unexpected: "object" } }],
    ["non-HTTP", { image: "javascript:synthetic()" }],
    ["relative", { image: "/synthetic-image.jpg" }],
    ["private", { image: "https://127.0.0.1/synthetic.jpg" }],
  ])("does not cache or persist a %s image response", async (label, body) => {
    const article = makeArticle(`malformed-${label}`);
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { result } = renderCache([article]);

    await advance(1000);

    expect(requestedLinks()).toEqual([article.link]);
    expect(result.current.ogpCache[article.link]).toBeUndefined();
    expect(result.current.getEntry(article.link)).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEYS.OGP_CACHE)).toBeNull();
  });

  it("can recover from failed JSON decoding when a visible link is revisited", async () => {
    const article = makeArticle("invalid-json");
    mockApiFetch
      .mockResolvedValueOnce(new Response("{synthetic-invalid-json", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse("https://images.test/decoded-on-revisit.jpg"));
    const { result, rerender } = renderCache([article]);
    await advance(1000);
    expect(requestedLinks()).toEqual([article.link]);
    rerender({ articles: [] });
    rerender({ articles: [article] });
    await advance(1000);

    expect(requestedLinks()).toEqual([article.link, article.link]);
    expect(result.current.ogpCache[article.link]).toBe(
      "https://images.test/decoded-on-revisit.jpg",
    );
  });

  it.each(["primary", "fallback"])(
    "ignores %s image decoding that completes after the target disappears",
    async (stage) => {
      const article = boothArticle();
      const decoded = deferred<unknown>();
      const response = jsonResponse();
      const parse = vi.spyOn(response, "json").mockReturnValueOnce(decoded.promise);
      if (stage === "fallback") mockApiFetch.mockResolvedValueOnce(jsonResponse());
      mockApiFetch.mockResolvedValueOnce(response);
      const { result, rerender } = renderCache([article]);
      await advance(0);
      expect(parse).toHaveBeenCalledTimes(1);
      const expectedLinks = stage === "fallback" ? [article.link, boothLink] : [article.link];
      expect(requestedLinks()).toEqual(expectedLinks);
      rerender({ articles: [] });
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      await act(async () => {
        decoded.resolve({ image: "https://images.test/late-decoded.jpg" });
      });
      await advance(1000);

      expect(requestedLinks()).toEqual(expectedLinks);
      expect(result.current.ogpCache[article.link]).toBeUndefined();
      expect(setItem).not.toHaveBeenCalled();
    },
  );

  it("does not start fallback when empty primary decoding finishes after unmount", async () => {
    const article = boothArticle();
    const decoded = deferred<unknown>();
    const response = jsonResponse();
    const parse = vi.spyOn(response, "json").mockReturnValueOnce(decoded.promise);
    mockApiFetch.mockResolvedValueOnce(response);
    const { unmount } = renderCache([article]);
    await advance(0);
    expect(parse).toHaveBeenCalledTimes(1);
    unmount();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      decoded.resolve({ image: "" });
    });
    await advance(1000);

    expect(requestedLinks()).toEqual([article.link]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("keeps existing BOOTH fallback after a genuinely empty successful primary", async () => {
    const article = boothArticle();
    const primary = deferred<Response>();
    mockApiFetch
      .mockReturnValueOnce(primary.promise)
      .mockResolvedValueOnce(jsonResponse("https://images.test/booth-product.jpg"));
    const { result } = renderCache([article]);
    await advance(0);
    expect(requestedLinks()).toEqual([article.link]);

    await resolveRequest(primary);
    await advance(500);

    expect(requestedLinks()).toEqual([article.link, boothLink]);
    expect(result.current.ogpCache[article.link]).toBe("https://images.test/booth-product.jpg");
    expect(result.current.getEntry(article.link)?.image).toBe(
      "https://images.test/booth-product.jpg",
    );
  });

  it("holds a concurrency slot until BOOTH fallback finishes", async () => {
    const article = boothArticle();
    const otherArticles = makeArticles(10);
    const primary = deferred<Response>();
    const fallback = deferred<Response>();
    mockApiFetch.mockImplementation((input) => {
      const link = requestLink(input);
      if (link === article.link) return primary.promise;
      if (link === boothLink) return fallback.promise;
      return new Promise<Response>(() => {});
    });
    renderCache([article, ...otherArticles]);
    await advance(OGP_STAGGER_MS * 10);
    expect(requestedLinks()).toHaveLength(10);

    await resolveRequest(primary);
    await advance(1000);
    expect(requestedLinks()).toHaveLength(11);
    expect(requestedLinks()).not.toContain(otherArticles[9].link);

    await resolveRequest(fallback, "https://images.test/booth-product.jpg");
    await advance(OGP_STAGGER_MS);
    expect(requestedLinks()).toHaveLength(12);
    expect(requestedLinks()).toContain(otherArticles[9].link);
  });

  it("skips cached images and preserves the existing full cache entry", async () => {
    const cached = makeArticle("cached");
    const fresh = makeArticle("fresh");
    const entry = {
      image: "https://images.test/cached.jpg",
      title: "Existing title",
      description: "Existing description",
      fetchedAt: 100,
    };
    localStorage.setItem(STORAGE_KEYS.OGP_CACHE, JSON.stringify({ [cached.link]: entry }));
    const { result } = renderCache([cached, fresh]);

    await advance(1000);

    expect(requestedLinks()).toEqual([fresh.link]);
    expect(result.current.ogpCache[cached.link]).toBe(entry.image);
    expect(result.current.getEntry(cached.link)).toEqual(entry);
  });
});
