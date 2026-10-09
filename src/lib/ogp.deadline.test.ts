// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPageOgpMeta, fetchTwitterFallbackImage } from "./ogp";
import * as fetchHelpers from "./fetch";

const { launchBrowser } = vi.hoisted(() => ({
  launchBrowser: vi.fn(() => {
    throw new Error("Browser Rendering is forbidden in offline OGP tests");
  }),
}));
vi.mock("@cloudflare/puppeteer", () => ({ default: { launch: launchBrowser } }));

const PAGE = "https://pages.test/article";
const TWEET = "https://x.com/synthetic-account/status/synthetic-post?lang=ja";
const PROXY = "https://vxtwitter.com/synthetic-account/status/synthetic-post?lang=ja";
const CANDIDATES = [
  "https://candidates.test/first",
  "https://candidates.test/second",
  "https://candidates.test/third",
  "https://candidates.test/fourth",
];
const IMAGE = "https://images.test/synthetic.jpg";
const EMPTY_ERROR = {
  title: "",
  description: "",
  image: "",
  errorReason: "fetch_throw",
  upstreamStatus: null,
};
const encoder = new TextEncoder();

interface SyntheticRequest {
  url: string;
  at: number;
  signal: AbortSignal;
  init: RequestInit;
}
interface Observation<T> {
  settled: boolean;
  value: T | undefined;
}

let requests: SyntheticRequest[];
let unexpectedTargets: string[];
let cleanupStreams: (() => void)[];
let startTime: number;

function observe<T>(promise: Promise<T>): Observation<T> {
  const state: Observation<T> = { settled: false, value: undefined };
  void promise.then((value) => {
    state.value = value;
    state.settled = true;
  });
  return state;
}

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolveResponse) => {
    resolve = resolveResponse;
  });
  return { promise, resolve };
}

function htmlResponse(content: string | ReadableStream<Uint8Array>, status = 200): Response {
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function imageHtml(image = IMAGE): string {
  return `<meta property="og:image" content="${image}">`;
}

function linksHtml(urls = CANDIDATES.slice(0, 3)): string {
  return urls.map((url) => `<a href="${url}">Synthetic link</a>`).join("");
}

function mockRoutes(
  routes: Record<string, (request: SyntheticRequest) => Response | Promise<Response>>,
): void {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const route = routes[url];
    if (!route || !init?.signal) {
      unexpectedTargets.push(url);
      throw new Error(`Unplanned offline fetch or missing AbortSignal: ${url}`);
    }
    const request = { url, at: Date.now() - startTime, signal: init.signal, init };
    requests.push(request);
    return route(request);
  });
}

function pendingFetch(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function responseAfter(ms: number, response: Response, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve(response);
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function controlledBody(
  initial = "",
  cancelImpl: () => void | Promise<void> = () => {},
): {
  body: ReadableStream<Uint8Array>;
  cancel: ReturnType<typeof vi.fn<() => void | Promise<void>>>;
  finish: (content?: string) => void;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let canceled = false;
  const cancel = vi.fn(() => {
    canceled = true;
    return cancelImpl();
  });
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (initial) controller.enqueue(encoder.encode(initial));
    },
    cancel,
  });
  const finish = (content = "") => {
    if (canceled || !controller) return;
    if (content) controller.enqueue(encoder.encode(content));
    controller.close();
    controller = undefined;
  };
  cleanupStreams.push(finish);
  return { body, cancel, finish };
}

function cappedBody(
  prefix: string,
  lateContent: string,
  maxBytes: number,
): {
  body: ReadableStream<Uint8Array>;
  cancel: ReturnType<typeof vi.fn<() => void | Promise<void>>>;
  pull: ReturnType<typeof vi.fn<(controller: ReadableStreamDefaultController<Uint8Array>) => void>>;
} {
  const prefixBytes = encoder.encode(prefix);
  const lateBytes = encoder.encode(lateContent);
  const bytes = new Uint8Array(maxBytes + lateBytes.length).fill(32);
  bytes.set(prefixBytes);
  bytes.set(lateBytes, maxBytes);
  const cancel = vi.fn();
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    controller.enqueue(bytes);
  });
  return {
    body: new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
    cancel,
    pull,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
  startTime = Date.now();
  requests = [];
  unexpectedTargets = [];
  cleanupStreams = [];
  launchBrowser.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      unexpectedTargets.push("unmocked fetch");
      throw new Error("Real network requests are forbidden");
    }),
  );
});

afterEach(async () => {
  for (const cleanup of cleanupStreams) cleanup();
  await vi.advanceTimersByTimeAsync(0);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(unexpectedTargets).toEqual([]);
  expect(launchBrowser).not.toHaveBeenCalled();
});

describe("fetchPageOgpMeta shared deadline", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "does not start a request for the invalid or expired budget %s",
    async (timeoutMs) => {
      expect(await fetchPageOgpMeta(PAGE, timeoutMs)).toEqual(EMPTY_ERROR);
      expect(fetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("settles a stalled partial body at the default 5000ms and cancels its reader", async () => {
    const stream = controlledBody("<html><head>");
    mockRoutes({ [PAGE]: () => htmlResponse(stream.body) });
    const result = observe(fetchPageOgpMeta(PAGE));
    await vi.advanceTimersByTimeAsync(4999);
    expect(result.settled).toBe(false);
    expect(stream.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.value).toEqual(EMPTY_ERROR);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(requests[0].signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares a 60ms budget between 40ms headers and a stalled body", async () => {
    const stream = controlledBody(imageHtml());
    mockRoutes({ [PAGE]: ({ signal }) => responseAfter(40, htmlResponse(stream.body), signal) });
    const result = observe(fetchPageOgpMeta(PAGE, 60));
    await vi.advanceTimersByTimeAsync(59);
    expect(result.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.value).toEqual(EMPTY_ERROR);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out pending headers at the supplied deadline", async () => {
    mockRoutes({ [PAGE]: ({ signal }) => pendingFetch(signal) });
    const result = observe(fetchPageOgpMeta(PAGE, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toEqual(EMPTY_ERROR);
    expect(requests[0].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 302])(
    "settles despite ignored fetch abort and cancels late %i headers without following or reading",
    async (status) => {
      const deferred = deferredResponse();
      const lateStream = controlledBody(imageHtml());
      mockRoutes({ [PAGE]: () => deferred.promise });
      const result = observe(fetchPageOgpMeta(PAGE, 60));
      await vi.advanceTimersByTimeAsync(60);
      expect(result.settled).toBe(true);
      expect(result.value).toEqual(EMPTY_ERROR);
      expect(requests[0].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      deferred.resolve(
        new Response(lateStream.body, { status, headers: { Location: "/late-hop" } }),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(lateStream.cancel).toHaveBeenCalledOnce();
      expect(lateStream.body.locked).toBe(false);
      expect(requests.map(({ url }) => url)).toEqual([PAGE]);
      expect(result.value).toEqual(EMPTY_ERROR);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("settles even when a reader ignores abort and its cancel operation rejects", async () => {
    const stream = controlledBody("<head>");
    const getReader = stream.body.getReader.bind(stream.body);
    const cancel = vi.fn(() => Promise.reject(new Error("synthetic ignored reader cancellation")));
    vi.spyOn(stream.body, "getReader").mockImplementation(() => {
      const reader = getReader();
      vi.spyOn(reader, "cancel").mockImplementation(cancel);
      return reader;
    });
    mockRoutes({ [PAGE]: () => htmlResponse(stream.body) });
    const result = observe(fetchPageOgpMeta(PAGE, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toEqual(EMPTY_ERROR);
    expect(cancel).toHaveBeenCalledOnce();
    expect(requests[0].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    stream.finish(imageHtml());
    await vi.advanceTimersByTimeAsync(0);
    expect(result.value).toEqual(EMPTY_ERROR);
    expect(stream.body.locked).toBe(false);
  });

  it("shares time through two safe redirect hops and the final body", async () => {
    const next = "https://pages.test/next";
    const final = "https://pages.test/final";
    const redirectCancels = [vi.fn(), vi.fn()];
    const stream = controlledBody("<html>");
    const redirect = (
      location: string,
      cancel: ReturnType<typeof vi.fn<() => void | Promise<void>>>,
    ) =>
      new Response(new ReadableStream({ cancel: () => cancel() }), {
        status: 302,
        headers: { Location: location },
      });
    mockRoutes({
      [PAGE]: ({ signal }) => responseAfter(20, redirect("/next", redirectCancels[0]), signal),
      [next]: ({ signal }) => responseAfter(20, redirect("/final", redirectCancels[1]), signal),
      [final]: ({ signal }) => responseAfter(10, htmlResponse(stream.body), signal),
    });
    const result = observe(fetchPageOgpMeta(PAGE, 60));
    await vi.advanceTimersByTimeAsync(59);
    expect(result.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.value).toEqual(EMPTY_ERROR);
    expect(requests.map(({ url, at }) => [url, at])).toEqual([
      [PAGE, 0],
      [next, 20],
      [final, 40],
    ]);
    for (const cancel of redirectCancels) expect(cancel).toHaveBeenCalledOnce();
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(requests.every(({ init }) => init.redirect === "manual")).toBe(true);
  });

  it("finishes normal metadata without an extra wait or stale abort timer", async () => {
    mockRoutes({
      [PAGE]: () =>
        htmlResponse(
          `<title>Page &amp; title</title><meta property="og:description" content="Description">${imageHtml()}`,
        ),
    });
    const result = await fetchPageOgpMeta(PAGE, 60);
    expect(result).toEqual({
      title: "Page & title",
      description: "Description",
      image: IMAGE,
      errorReason: null,
      upstreamStatus: 200,
    });
    expect(Date.now() - startTime).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(requests[0].signal.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("removes any body abort listeners after fast completion", async () => {
    const added = vi.spyOn(AbortSignal.prototype, "addEventListener");
    const removed = vi.spyOn(AbortSignal.prototype, "removeEventListener");
    mockRoutes({ [PAGE]: () => htmlResponse(imageHtml()) });
    expect((await fetchPageOgpMeta(PAGE, 60)).image).toBe(IMAGE);
    for (const [event, listener] of added.mock.calls) {
      if (event !== "abort") continue;
      expect(
        removed.mock.calls.some(
          ([removedEvent, removedListener]) =>
            removedEvent === event && removedListener === listener,
        ),
      ).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts a body completed just before the shared deadline", async () => {
    const stream = controlledBody("<head>");
    mockRoutes({ [PAGE]: ({ signal }) => responseAfter(40, htmlResponse(stream.body), signal) });
    const result = observe(fetchPageOgpMeta(PAGE, 60));
    await vi.advanceTimersByTimeAsync(59);
    stream.finish(imageHtml());
    await vi.advanceTimersByTimeAsync(0);
    expect(result.settled).toBe(true);
    expect(result.value).toMatchObject({ image: IMAGE, errorReason: null });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests[0].signal.aborted).toBe(false);
  });

  it.each(["pending", "rejecting"])(
    "does not wait on %s cancellation after body timeout",
    async (mode) => {
      const stream = controlledBody("", () =>
        mode === "pending"
          ? new Promise<void>(() => {})
          : Promise.reject(new Error("cleanup rejected")),
      );
      mockRoutes({ [PAGE]: () => htmlResponse(stream.body) });
      const result = observe(fetchPageOgpMeta(PAGE, 60));
      await vi.advanceTimersByTimeAsync(60);
      expect(result.settled).toBe(true);
      expect(result.value).toEqual(EMPTY_ERROR);
      expect(stream.cancel).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["throwing", "rejecting"])(
    "preserves a genuine read error despite %s reader cancellation",
    async (mode) => {
      const originalError = new Error("synthetic original body failure");
      const cleanupError = new Error("synthetic cleanup failure");
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(originalError);
        },
      });
      const getReader = body.getReader.bind(body);
      vi.spyOn(body, "getReader").mockImplementation(() => {
        const reader = getReader();
        vi.spyOn(reader, "cancel").mockImplementation(() => {
          if (mode === "throwing") throw cleanupError;
          return Promise.reject(cleanupError);
        });
        return reader;
      });
      mockRoutes({ [PAGE]: () => htmlResponse(body) });
      expect(await fetchPageOgpMeta(PAGE, 60)).toEqual(EMPTY_ERROR);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("synthetic original body failure"),
      );
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining("synthetic cleanup failure"),
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("preserves a genuine fetch error and cleans its deadline", async () => {
    mockRoutes({
      [PAGE]: () => {
        throw new Error("synthetic original fetch failure");
      },
    });
    expect(await fetchPageOgpMeta(PAGE, 60)).toEqual(EMPTY_ERROR);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("synthetic original fetch failure"),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { response: () => htmlResponse("denied", 403), reason: "non_ok_status", status: 403 },
    { response: () => new Response(null, { status: 200 }), reason: "no_body", status: 200 },
    {
      response: () => htmlResponse("<html>no metadata</html>"),
      reason: "no_meta_tags",
      status: 200,
    },
  ])(
    "preserves $reason and clears timers on early completion",
    async ({ response, reason, status }) => {
      mockRoutes({ [PAGE]: response });
      expect(await fetchPageOgpMeta(PAGE, 60)).toEqual({
        ...EMPTY_ERROR,
        errorReason: reason,
        upstreamStatus: status,
      });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60);
      expect(requests[0].signal.aborted).toBe(false);
    },
  );
});

describe("fetchTwitterFallbackImage one total deadline", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "does not start a request for the invalid or expired chain budget %s",
    async (timeoutMs) => {
      expect(await fetchTwitterFallbackImage(TWEET, timeoutMs)).toBe("");
      expect(fetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("stops at 3000ms after one stalled candidate instead of starting 3000ms-per-link attempts", async () => {
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml()),
      [CANDIDATES[0]]: ({ signal }) => pendingFetch(signal),
      [CANDIDATES[1]]: ({ signal }) => pendingFetch(signal),
      [CANDIDATES[2]]: ({ signal }) => pendingFetch(signal),
    });
    const result = observe(fetchTwitterFallbackImage(TWEET));
    await vi.advanceTimersByTimeAsync(2999);
    expect(result.settled).toBe(false);
    expect(requests.map(({ url }) => url)).toEqual([PROXY, CANDIDATES[0]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(requests.map(({ url, at }) => [url, at])).toEqual([
      [PROXY, 0],
      [CANDIDATES[0], 0],
    ]);
    expect(requests[1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([500, 5000])("caps original tweet headers at min(%i, 3000)ms", async (timeoutMs) => {
    mockRoutes({ [PROXY]: ({ signal }) => pendingFetch(signal) });
    const result = observe(fetchTwitterFallbackImage(TWEET, timeoutMs));
    const deadline = Math.min(timeoutMs, 3000);
    await vi.advanceTimersByTimeAsync(deadline - 1);
    expect(result.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(requests[0].signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels late tweet headers from an abort-ignoring fetch without starting candidates", async () => {
    const deferred = deferredResponse();
    const lateStream = controlledBody(linksHtml());
    mockRoutes({ [PROXY]: () => deferred.promise });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(requests[0].signal.aborted).toBe(true);
    deferred.resolve(htmlResponse(lateStream.body));
    await vi.advanceTimersByTimeAsync(0);
    expect(lateStream.cancel).toHaveBeenCalledOnce();
    expect(requests.map(({ url }) => url)).toEqual([PROXY]);
    expect(result.value).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a candidate image arriving after total deadline when fetch ignores abort", async () => {
    const deferred = deferredResponse();
    const lateStream = controlledBody(imageHtml());
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml()),
      [CANDIDATES[0]]: () => deferred.promise,
    });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(requests[1].signal.aborted).toBe(true);
    deferred.resolve(htmlResponse(lateStream.body));
    await vi.advanceTimersByTimeAsync(0);
    expect(lateStream.cancel).toHaveBeenCalledOnce();
    expect(requests.map(({ url }) => url)).toEqual([PROXY, CANDIDATES[0]]);
    expect(result.value).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes original tweet body time and cancels it without starting a candidate", async () => {
    const stream = controlledBody(linksHtml());
    mockRoutes({
      [PROXY]: ({ signal }) => responseAfter(20, htmlResponse(stream.body), signal),
      [CANDIDATES[0]]: () => htmlResponse("no metadata"),
      [CANDIDATES[1]]: () => htmlResponse("no metadata"),
      [CANDIDATES[2]]: () => htmlResponse("no metadata"),
    });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives the first candidate only the budget left after tweet headers and body", async () => {
    const stream = controlledBody("<html>");
    mockRoutes({
      [PROXY]: ({ signal }) => responseAfter(20, htmlResponse(stream.body), signal),
      [CANDIDATES[0]]: ({ signal }) => pendingFetch(signal),
      [CANDIDATES[1]]: ({ signal }) => pendingFetch(signal),
      [CANDIDATES[2]]: ({ signal }) => pendingFetch(signal),
    });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(40);
    stream.finish(linksHtml());
    await vi.advanceTimersByTimeAsync(0);
    expect(requests.map(({ url, at }) => [url, at])).toEqual([
      [PROXY, 0],
      [CANDIDATES[0], 40],
    ]);
    await vi.advanceTimersByTimeAsync(20);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a later candidate when earlier metadata completes at the deadline", async () => {
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml()),
      [CANDIDATES[0]]: ({ signal }) =>
        responseAfter(60, htmlResponse("<title>No image</title>"), signal),
      [CANDIDATES[1]]: () => htmlResponse(imageHtml()),
    });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(requests.map(({ url }) => url)).toEqual([PROXY, CANDIDATES[0]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start any candidate when the tweet body completes exactly at the deadline", async () => {
    const stream = controlledBody("<html>");
    mockRoutes({
      [PROXY]: () => htmlResponse(stream.body),
      [CANDIDATES[0]]: () => htmlResponse(imageHtml()),
    });
    // Enqueue completion before the function schedules its own deadline timer.
    setTimeout(() => stream.finish(linksHtml()), 60);
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(requests.map(({ url }) => url)).toEqual([PROXY]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares elapsed time across fast first and stalled second candidate attempts", async () => {
    mockRoutes({
      [PROXY]: ({ signal }) => responseAfter(10, htmlResponse(linksHtml()), signal),
      [CANDIDATES[0]]: ({ signal }) =>
        responseAfter(30, htmlResponse("<title>No image</title>"), signal),
      [CANDIDATES[1]]: ({ signal }) => pendingFetch(signal),
      [CANDIDATES[2]]: () => htmlResponse(imageHtml()),
    });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(59);
    expect(result.settled).toBe(false);
    expect(requests.map(({ url, at }) => [url, at])).toEqual([
      [PROXY, 0],
      [CANDIDATES[0], 10],
      [CANDIDATES[1], 40],
    ]);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(requests[2].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares candidate-body time with the fallback deadline", async () => {
    const stream = controlledBody(imageHtml());
    mockRoutes({
      [PROXY]: ({ signal }) => responseAfter(20, htmlResponse(linksHtml()), signal),
      [CANDIDATES[0]]: ({ signal }) => responseAfter(20, htmlResponse(stream.body), signal),
      [CANDIDATES[1]]: () => htmlResponse(imageHtml()),
    });
    const result = observe(fetchTwitterFallbackImage(TWEET, 60));
    await vi.advanceTimersByTimeAsync(60);
    expect(result.settled).toBe(true);
    expect(result.value).toBe("");
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(requests.map(({ url, at }) => [url, at])).toEqual([
      [PROXY, 0],
      [CANDIDATES[0], 20],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns the first valid image immediately and preserves normalized original URL and bot headers", async () => {
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml()),
      [CANDIDATES[0]]: () => htmlResponse(imageHtml()),
    });
    expect(await fetchTwitterFallbackImage(TWEET)).toBe(IMAGE);
    expect(Date.now() - startTime).toBe(0);
    expect(requests.map(({ url }) => url)).toEqual([PROXY, CANDIDATES[0]]);
    expect(new Headers(requests[0].init.headers).get("User-Agent")).toBe("Twitterbot/1.0");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(requests.every(({ signal }) => !signal.aborted)).toBe(true);
  });

  it("continues sequentially after fast failures and invalid images while preserving first valid image order", async () => {
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml()),
      [CANDIDATES[0]]: () => {
        throw new Error("synthetic fast failure");
      },
      [CANDIDATES[1]]: () => htmlResponse(imageHtml("https://127.0.0.1/private.jpg")),
      [CANDIDATES[2]]: () => htmlResponse(imageHtml()),
    });
    expect(await fetchTwitterFallbackImage(TWEET, 60)).toBe(IMAGE);
    expect(requests.map(({ url }) => url)).toEqual([PROXY, ...CANDIDATES.slice(0, 3)]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tries at most three linked pages even if a fourth has an image", async () => {
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml(CANDIDATES)),
      [CANDIDATES[0]]: () => htmlResponse("no metadata"),
      [CANDIDATES[1]]: () => htmlResponse("no metadata"),
      [CANDIDATES[2]]: () => htmlResponse("no metadata"),
    });
    expect(await fetchTwitterFallbackImage(TWEET, 60)).toBe("");
    expect(requests.map(({ url }) => url)).toEqual([PROXY, ...CANDIDATES.slice(0, 3)]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips private, recursive, direct-image and duplicate links without expanding requests", async () => {
    const firstWithFragment = `${CANDIDATES[0]}#one`;
    const links = [
      "https://127.0.0.1/private",
      "https://10.0.0.1/private",
      "https://x.com/other/status/1",
      "https://t.co/short",
      "https://images.test/direct.jpg",
      firstWithFragment,
      `${CANDIDATES[0]}#two`,
      CANDIDATES[1],
    ];
    mockRoutes({
      [PROXY]: () => htmlResponse(linksHtml(links)),
      [firstWithFragment]: () => htmlResponse("no metadata"),
      [CANDIDATES[1]]: () => htmlResponse(imageHtml()),
    });
    expect(await fetchTwitterFallbackImage(TWEET, 60)).toBe(IMAGE);
    expect(requests.map(({ url }) => url)).toEqual([PROXY, firstWithFragment, CANDIDATES[1]]);
  });
});

describe("deadline changes retain safety and partial byte limits", () => {
  it.each([
    "https://127.0.0.1/private",
    "https://10.0.0.1/private",
    "http://pages.test/downgrade",
    PAGE,
  ])("rejects unsafe or looping redirect %s before fetching it", async (location) => {
    const cancel = vi.fn();
    mockRoutes({
      [PAGE]: () =>
        new Response(new ReadableStream({ cancel }), {
          status: 302,
          headers: { Location: location },
        }),
    });
    expect(await fetchPageOgpMeta(PAGE, 60)).toEqual(EMPTY_ERROR);
    expect(fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(requests[0].init.redirect).toBe("manual");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still caps safe redirect hops at five requests", async () => {
    const urls = [PAGE, ...Array.from({ length: 4 }, (_, i) => `https://pages.test/hop-${i + 1}`)];
    const routes = Object.fromEntries(
      urls.map((url, i) => [
        url,
        () => new Response(null, { status: 302, headers: { Location: `/hop-${i + 1}` } }),
      ]),
    );
    mockRoutes(routes);
    expect(await fetchPageOgpMeta(PAGE, 60)).toEqual(EMPTY_ERROR);
    expect(requests.map(({ url }) => url)).toEqual(urls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])(
    "parses only the first 512KiB of a page, with early metadata %s",
    async (earlyMetadata) => {
      const stream = cappedBody(
        earlyMetadata ? imageHtml() : "<html>",
        imageHtml("https://images.test/late.jpg"),
        512 * 1024,
      );
      mockRoutes({ [PAGE]: () => htmlResponse(stream.body) });
      const result = await fetchPageOgpMeta(PAGE, 60);
      expect(result.image).toBe(earlyMetadata ? IMAGE : "");
      expect(result.errorReason).toBe(earlyMetadata ? null : "no_meta_tags");
      expect(stream.pull).toHaveBeenCalledOnce();
      expect(stream.cancel).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("extracts tweet links only within the original 256KiB body cap", async () => {
    const stream = cappedBody(linksHtml([CANDIDATES[0]]), linksHtml([CANDIDATES[1]]), 256 * 1024);
    mockRoutes({
      [PROXY]: () => htmlResponse(stream.body),
      [CANDIDATES[0]]: () => htmlResponse("no metadata"),
    });
    expect(await fetchTwitterFallbackImage(TWEET, 60)).toBe("");
    expect(requests.map(({ url }) => url)).toEqual([PROXY, CANDIDATES[0]]);
    expect(stream.pull).toHaveBeenCalledOnce();
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("wall-clock expiry before abort timer delivery", () => {
  it.each(["page", "tweet"] as const)(
    "cancels exact-expiry %s 200 headers before reading the body",
    async (kind) => {
      const url = kind === "page" ? PAGE : "https://tweets.test/synthetic-post";
      const stream = controlledBody(kind === "page" ? imageHtml() : linksHtml());
      const getReader = vi.spyOn(stream.body, "getReader");
      mockRoutes({
        [url]: ({ signal }) => {
          // Move only the wall clock: the scheduled abort callback has not been delivered.
          vi.setSystemTime(startTime + 60);
          expect(signal.aborted).toBe(false);
          return htmlResponse(stream.body);
        },
      });

      const result =
        kind === "page"
          ? await fetchPageOgpMeta(url, 60)
          : await fetchTwitterFallbackImage(url, 60);

      expect(result).toEqual(kind === "page" ? EMPTY_ERROR : "");
      expect(stream.cancel).toHaveBeenCalledOnce();
      expect(getReader).not.toHaveBeenCalled();
      expect(stream.body.locked).toBe(false);
      expect(requests.map(({ url: requestedUrl }) => requestedUrl)).toEqual([url]);
      expect(requests[0].signal.aborted).toBe(true);
      expect(Date.now() - startTime).toBe(60);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("cancels an exact-expiry 302 body without starting its next hop", async () => {
    const next = "https://pages.test/wall-clock-next";
    const stream = controlledBody("Synthetic redirect body");
    const getReader = vi.spyOn(stream.body, "getReader");
    mockRoutes({
      [PAGE]: ({ signal }) => {
        vi.setSystemTime(startTime + 60);
        expect(signal.aborted).toBe(false);
        return new Response(stream.body, { status: 302, headers: { Location: next } });
      },
      [next]: () => htmlResponse(imageHtml()),
    });

    expect(await fetchPageOgpMeta(PAGE, 60)).toEqual(EMPTY_ERROR);
    expect(requests.map(({ url }) => url)).toEqual([PAGE]);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
    expect(stream.body.locked).toBe(false);
    expect(requests[0].signal.aborted).toBe(true);
    expect(Date.now() - startTime).toBe(60);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["page", "tweet"] as const)(
    "retains %s Response ownership if the deadline.run post-resolution check expires",
    async (kind) => {
      const url = kind === "page" ? PAGE : "https://tweets.test/synthetic-post";
      const stream = controlledBody(kind === "page" ? imageHtml() : linksHtml());
      const getReader = vi.spyOn(stream.body, "getReader");
      const followSafeRedirects = fetchHelpers.fetchFollowSafeRedirects;
      const follow = vi
        .spyOn(fetchHelpers, "fetchFollowSafeRedirects")
        .mockImplementation(async (...args) => {
          const response = await followSafeRedirects(...args);
          // The redirect helper completed within budget. Expire before its caller resumes.
          expect(Date.now() - startTime).toBe(0);
          vi.setSystemTime(startTime + 60);
          expect(args[3]?.aborted).toBe(false);
          return response;
        });
      const added = vi.spyOn(AbortSignal.prototype, "addEventListener");
      const removed = vi.spyOn(AbortSignal.prototype, "removeEventListener");
      mockRoutes({ [url]: () => htmlResponse(stream.body) });

      const result =
        kind === "page"
          ? await fetchPageOgpMeta(url, 60)
          : await fetchTwitterFallbackImage(url, 60);

      expect(result).toEqual(kind === "page" ? EMPTY_ERROR : "");
      expect(follow).toHaveBeenCalledOnce();
      expect(stream.cancel).toHaveBeenCalledOnce();
      expect(getReader).not.toHaveBeenCalled();
      expect(stream.body.locked).toBe(false);
      expect(requests.map(({ url: requestedUrl }) => requestedUrl)).toEqual([url]);
      expect(requests[0].signal.aborted).toBe(true);
      for (const [event, listener] of added.mock.calls) {
        if (event !== "abort") continue;
        expect(
          removed.mock.calls.some(
            ([removedEvent, removedListener]) =>
              removedEvent === event && removedListener === listener,
          ),
        ).toBe(true);
      }
      expect(Date.now() - startTime).toBe(60);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
