import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODEL } from "../lib/ai-models";
import type { CachedSummary } from "../lib/ai-summary-contract";
import {
  useImmersiveSummaryCache,
  type ImmersiveSummaryCacheOptions,
} from "./useImmersiveSummaryCache";

const { authReady } = vi.hoisted(() => ({ authReady: vi.fn<() => Promise<void>>() }));
vi.mock("./useAuth", () => ({ getAuthReady: authReady }));
const fetchMock = vi.fn<typeof fetch>();
const a = "https://example.com/a";
const b = "https://example.com/b";
const options: ImmersiveSummaryCacheOptions = {
  enabled: true,
  userId: "user-a",
  preferenceUserId: "user-a",
  authUsable: true,
  scopeKey: "all",
  provider: "auto",
  model: DEFAULT_AI_MODEL,
  urls: [a],
  requestAllowed: true,
};
function cached(url = a): CachedSummary {
  return {
    url,
    result: `Saved ${url}`,
    metadata: {
      version: 1,
      model: DEFAULT_AI_MODEL,
      promptVersion: null,
      bodyHash: null,
      generatedAt: null,
      inputCharacters: null,
      inputTruncated: null,
      completeness: "unknown",
      usage: null,
    },
  };
}
function response(summaries: CachedSummary[] = []) {
  return new Response(JSON.stringify({ model: DEFAULT_AI_MODEL, summaries }), {
    headers: { "Content-Type": "application/json" },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  authReady.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockImplementation(async () => response());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cache-only immersive transport", () => {
  it("waits for auth readiness, makes one selected-model same-origin cache read and distinguishes hits/misses", async () => {
    const ready = deferred<void>();
    authReady.mockReturnValue(ready.promise);
    fetchMock.mockResolvedValue(response([cached(a)]));
    const { result } = renderHook(useImmersiveSummaryCache, {
      initialProps: { ...options, urls: [a, a, b, "javascript:bad", "http://localhost/"] },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.getEntry(a).kind).toBe("loading");
    await act(async () => ready.resolve());
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("hit"));
    expect(result.current.getEntry(b).kind).toBe("miss");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(input).toBe("/api/ai/summaries/cache");
    expect(init).toMatchObject({
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init?.body as string)).toEqual({ model: DEFAULT_AI_MODEL, urls: [a, b] });
  });

  it.each([
    { enabled: false },
    { userId: null },
    { preferenceUserId: null },
    { preferenceUserId: "other" },
    { authUsable: false },
    { provider: "browser" },
    { provider: undefined },
    { model: undefined },
  ] as Partial<ImmersiveSummaryCacheOptions>[])(
    "disables unowned or unusable partitions without any fetch: %j",
    async (patch) => {
      const { result } = renderHook(useImmersiveSummaryCache, {
        initialProps: { ...options, ...patch },
      });
      await flush();
      expect(result.current.disabledReason).toBeTruthy();
      expect(result.current.getEntry(a).kind).toBe("disabled");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("bounds the current window at 12 and does not background-drain later URLs", async () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/${i}`);
    const { result, rerender } = renderHook(useImmersiveSummaryCache, {
      initialProps: { ...options, urls },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string).urls).toEqual(urls.slice(0, 12));
    rerender({ ...options, urls: [...urls] });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.entries.size).toBe(12);
    expect(result.current.getEntry(urls[12]!).kind).toBe("idle");
  });

  it("does not refetch an equivalent array, a miss, or on focus/visibility/timer events", async () => {
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("miss"));
    rerender({ ...options, urls: [a, a] });
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains misses while hidden and reads only the currently supplied window on reopening", async () => {
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("miss"));
    rerender({ ...options, urls: [a, b], requestAllowed: false });
    await flush();
    expect(result.current.getEntry(a).kind).toBe("miss");
    expect(result.current.getEntry(b).kind).toBe("idle");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ ...options, urls: [a, b] });
    await waitFor(() => expect(result.current.getEntry(b).kind).toBe("miss"));
    expect(JSON.parse(fetchMock.mock.calls[1]![1]?.body as string).urls).toEqual([b]);
  });

  it("rechecks the scheduling gate after waiting for auth without wiping negatives", async () => {
    const ready = deferred<void>();
    authReady.mockReturnValue(ready.promise);
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    rerender({ ...options, requestAllowed: false });
    await act(async () => ready.resolve());
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.getEntry(a).kind).toBe("idle");
    rerender(options);
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("miss"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serializes changed windows, allows a same-partition result to finish and exposes only relevant URLs", async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValue(response([cached(b)]));
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ ...options, urls: [b] });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.entries.has(a)).toBe(false);
    await act(async () => old.resolve(response([cached(a)])));
    await waitFor(() => expect(result.current.getEntry(b).kind).toBe("hit"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.getEntry(a).kind).toBe("idle");
    rerender(options);
    await flush();
    expect(result.current.getEntry(a).kind).toBe("hit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404, 429, 500])(
    "makes HTTP %i terminal without recovery, reload or a retry until asked",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response("failure", { status, headers: { "Sec-Session-Challenge": "challenge" } }),
      );
      const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
      await waitFor(() => expect(result.current.getEntry(a).kind).toBe("error"));
      expect(result.current.getEntry(a)).toMatchObject({ kind: "error", status });
      rerender({ ...options, urls: [a] });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "not-json",
    JSON.stringify({ summaries: [] }),
    JSON.stringify({ model: DEFAULT_AI_MODEL, summaries: [cached(b)] }),
    JSON.stringify({
      model: DEFAULT_AI_MODEL,
      summaries: [{ ...cached(), result: "あ".repeat(45_000) }],
    }),
  ])("rejects malformed/oversized batches as terminal errors: %s", async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    const { result } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("error"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds missing or dishonest Content-Length response streams in bytes", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
            controller.close();
          },
        }),
        { headers: { "Content-Length": "1" } },
      ),
    );
    const { result } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("error"));
  });

  it("coalesces rapid manual retries, and retries only terminal entries in the current window", async () => {
    const pending = deferred<Response>();
    const { result } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("miss"));
    fetchMock.mockReturnValue(pending.promise);
    act(() => {
      result.current.retry(b);
      result.current.retry(a);
      result.current.retry(a);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    act(() => result.current.retry(a));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(response([cached()])));
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("hit"));
    act(() => result.current.retry(a));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("terminates a timed-out fetch even if the mock ignores abort and never automatically retries", async () => {
    vi.useFakeTimers();
    const old = deferred<Response>();
    fetchMock.mockReturnValue(old.promise);
    const { result } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current.loading).toBe(false);
    expect(result.current.getEntry(a).kind).toBe("error");
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    await act(async () => {
      old.resolve(response([cached()]));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.getEntry(a).kind).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("partition and monotonic request isolation", () => {
  it.each([
    { userId: "user-b", preferenceUserId: "user-b" },
    { scopeKey: "feed-b" },
    { provider: "workers-ai" },
    { authUsable: false },
    { enabled: false },
    { model: "@cf/meta/llama-3.2-3b-instruct" },
  ] as Partial<ImmersiveSummaryCacheOptions>[])(
    "aborts and clears on context changes, including abort-ignoring results: %j",
    async (patch) => {
      const old = deferred<Response>();
      fetchMock.mockReturnValueOnce(old.promise).mockImplementation(async () => response());
      const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      rerender({ ...options, ...patch });
      expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
      await act(async () => old.resolve(response([cached()])));
      await flush();
      expect(result.current.getEntry(a).kind).not.toBe("hit");
    },
  );

  it("does not fetch after cancellation while waiting on auth readiness", async () => {
    const ready = deferred<void>();
    authReady.mockReturnValue(ready.promise);
    const { rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    rerender({ ...options, authUsable: false });
    await act(async () => ready.resolve());
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guards deferred body parsing after A→B→A and prevents retained stale retry callbacks", async () => {
    const body = deferred<string>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode(await body.promise));
              controller.close();
            },
          }),
        ),
      )
      .mockImplementation(async () => response());
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const staleRetry = result.current.retry;
    rerender({ ...options, scopeKey: "b" });
    await flush();
    rerender(options);
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("miss"));
    await act(async () =>
      body.resolve(JSON.stringify({ model: DEFAULT_AI_MODEL, summaries: [cached()] })),
    );
    await flush();
    expect(result.current.getEntry(a).kind).toBe("miss");
    const count = fetchMock.mock.calls.length;
    act(() => staleRetry(a));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });

  it("ignores an old rejection and finally while the new request remains pending", async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ ...options, scopeKey: "other" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => old.reject(new Error("old network failure")));
    await flush();
    expect(result.current.loading).toBe(true);
    expect(result.current.getEntry(a).kind).toBe("loading");
    await act(async () => current.resolve(response()));
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("miss"));
  });

  it("clears immediate render output before context-effect cleanup", async () => {
    fetchMock.mockResolvedValue(response([cached()]));
    const observed: string[] = [];
    const { rerender } = renderHook(
      (input: ImmersiveSummaryCacheOptions) => {
        const state = useImmersiveSummaryCache(input);
        if (input.userId === "user-b") observed.push(state.getEntry(a).kind);
        return state;
      },
      { initialProps: options },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await flush();
    rerender({ ...options, userId: "user-b", preferenceUserId: "user-b" });
    expect(observed).not.toContain("hit");
  });

  it("aborts on unmount and does not issue another read on late completion", async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValue(old.promise);
    const { unmount } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    await act(async () => old.resolve(response([cached()])));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds hits at 48 and distinguishes evicted hits from real misses, allowing only manual reread", async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(init?.body as string) as { urls: string[] };
      return response(body.urls.map((url) => cached(url)));
    });
    const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("hit"));
    for (let batch = 0; batch < 4; batch++) {
      const urls = Array.from({ length: 12 }, (_, i) => `https://example.com/${batch}/${i}`);
      rerender({ ...options, urls });
      await waitFor(() => expect(result.current.getEntry(urls[0]!).kind).toBe("hit"));
    }
    const count = fetchMock.mock.calls.length;
    rerender(options);
    await flush();
    expect(result.current.getEntry(a).kind).toBe("evicted");
    expect(fetchMock).toHaveBeenCalledTimes(count);
    act(() => result.current.retry(a));
    await waitFor(() => expect(result.current.getEntry(a).kind).toBe("hit"));
    expect(fetchMock).toHaveBeenCalledTimes(count + 1);
  });
});

it("does not send a departed window after auth readiness; only the latest window is read", async () => {
  const ready = deferred<void>();
  authReady.mockReturnValue(ready.promise);
  const { result, rerender } = renderHook(useImmersiveSummaryCache, { initialProps: options });
  rerender({ ...options, urls: [b] });
  await act(async () => ready.resolve());
  await waitFor(() => expect(result.current.getEntry(b).kind).toBe("miss"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string).urls).toEqual([b]);
});

it("uses fresh monotonic generations when manually retrying a timeout", async () => {
  vi.useFakeTimers();
  const old = deferred<Response>();
  const current = deferred<Response>();
  fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const { result } = renderHook(useImmersiveSummaryCache, { initialProps: options });
  await flush();
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(result.current.getEntry(a).kind).toBe("error");
  act(() => result.current.retry(a));
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => old.resolve(response([cached()])));
  await flush();
  expect(result.current.loading).toBe(true);
  expect(result.current.getEntry(a).kind).toBe("loading");
  await act(async () => current.resolve(response()));
  await flush();
  expect(result.current.getEntry(a).kind).toBe("miss");
});

it("times out auth readiness without issuing a late fetch", async () => {
  vi.useFakeTimers();
  const ready = deferred<void>();
  authReady.mockReturnValue(ready.promise);
  const { result } = renderHook(useImmersiveSummaryCache, { initialProps: options });
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(result.current.getEntry(a).kind).toBe("error");
  await act(async () => ready.resolve());
  await flush();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns truthful unavailable state for empty or invalid article URLs without fetching", async () => {
  const { result } = renderHook(useImmersiveSummaryCache, {
    initialProps: { ...options, urls: ["", "javascript:bad", "http://localhost/a"] },
  });
  await flush();
  for (const url of ["", "javascript:bad", "http://localhost/a"]) {
    expect(result.current.getEntry(url)).toEqual({
      kind: "disabled",
      reason: "この記事のURLでは保存済み要約を利用できません",
    });
    act(() => result.current.retry(url));
  }
  expect(result.current.loading).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
