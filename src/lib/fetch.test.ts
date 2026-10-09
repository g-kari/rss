// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { BodyTooLargeError, fetchFollowSafeRedirects, readResponseText } from "./fetch";

const MAX_BYTES = 10 * 1024 * 1024;

function responseWithBytes(size: number, headers?: HeadersInit) {
  let remaining = size;
  const cancel = vi.fn();
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (remaining === 0) {
      controller.close();
      return;
    }
    const bytes = Math.min(remaining, 64 * 1024);
    remaining -= bytes;
    controller.enqueue(new Uint8Array(bytes).fill(97));
  });
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  return { response: new Response(body, { headers }), pull, cancel };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("readResponseText", () => {
  it.each([MAX_BYTES - 1, MAX_BYTES])("accepts %i bytes without truncation", async (size) => {
    const { response } = responseWithBytes(size);
    expect((await readResponseText(response, MAX_BYTES)).length).toBe(size);
  });

  it.each([undefined, "1", String(MAX_BYTES), "invalid", "-1"])(
    "rejects actual oversized bytes with Content-Length %s and cancels the stream",
    async (length) => {
      const headers = length === undefined ? undefined : { "Content-Length": length };
      const { response, cancel } = responseWithBytes(MAX_BYTES + 1, headers);
      await expect(readResponseText(response, MAX_BYTES)).rejects.toBeInstanceOf(BodyTooLargeError);
      expect(cancel).toHaveBeenCalledOnce();
      expect(response.body?.locked).toBe(false);
    },
  );

  it("rejects an oversized Content-Length before reading even when the body is smaller", async () => {
    const { response, pull, cancel } = responseWithBytes(1, {
      "Content-Length": String(MAX_BYTES + 1),
    });
    await expect(readResponseText(response, MAX_BYTES)).rejects.toThrow("exceeds");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts an honest Content-Length at the limit", async () => {
    const { response } = responseWithBytes(MAX_BYTES, { "Content-Length": String(MAX_BYTES) });
    expect((await readResponseText(response, MAX_BYTES)).length).toBe(MAX_BYTES);
  });

  it("decodes UTF-8 across chunk boundaries and enforces bytes rather than characters", async () => {
    const bytes = new TextEncoder().encode("あ😀");
    const makeResponse = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
          },
        }),
      );
    expect(await readResponseText(makeResponse(), bytes.length)).toBe("あ😀");
    await expect(readResponseText(makeResponse(), bytes.length - 1)).rejects.toThrow("exceeds");
  });

  it("times out and cancels a stalled body without waiting for cancellation to settle", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const read = readResponseText(response, MAX_BYTES, 50);
    const rejection = expect(read).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("propagates body stream errors and releases the reader", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("connection lost"));
        },
      }),
    );
    await expect(readResponseText(response, MAX_BYTES)).rejects.toThrow("connection lost");
    expect(response.body?.locked).toBe(false);
  });

  it("returns an empty string for a missing body", async () => {
    expect(await readResponseText(new Response(null), MAX_BYTES)).toBe("");
  });
});

describe("safe redirects", () => {
  it("applies an optional stricter policy before the initial network request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchFollowSafeRedirects(
        "https://example.com/feed?token=secret",
        {},
        1000,
        undefined,
        undefined,
        {
          validateUrl: () => false,
        },
      ),
    ).rejects.toThrow("policy");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("applies the stricter policy before every redirected network request", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/feed?token=secret" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const policy = vi.fn((url: string) => !new URL(url).search);
    await expect(
      fetchFollowSafeRedirects("https://example.com/feed", {}, 1000, undefined, undefined, {
        validateUrl: policy,
      }),
    ).rejects.toThrow("policy");
    expect(fetch).toHaveBeenCalledOnce();
    expect(policy.mock.calls.map(([url]) => url)).toEqual([
      "https://example.com/feed",
      "https://example.com/feed?token=secret",
    ]);
  });

  it("reports the validated final URL without trusting Response.url", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "/final" } }))
      .mockResolvedValueOnce(new Response("feed"));
    vi.stubGlobal("fetch", fetch);
    const finalUrl = vi.fn();
    await fetchFollowSafeRedirects("https://example.com/feed", {}, 1000, undefined, undefined, {
      validateUrl: () => true,
      onResponseUrl: finalUrl,
    });
    expect(finalUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/final");
  });

  it("cancels intermediate redirect bodies before following", async () => {
    const cancel = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          status: 302,
          headers: { Location: "/next" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", fetch);
    const response = await fetchFollowSafeRedirects("https://example.com/feed", {}, 1000);
    expect(await response.text()).toBe("ok");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[1][0]).toBe("https://example.com/next");
  });

  it.each(["http://example.com/feed", "https://127.0.0.1/feed"])(
    "still rejects unsafe redirects to %s and cancels the rejected response",
    async (location) => {
      const cancel = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new ReadableStream({ cancel }), {
            status: 302,
            headers: { Location: location },
          }),
        ),
      );
      await expect(
        fetchFollowSafeRedirects("https://example.com/feed", {}, 1000),
      ).rejects.toThrow();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("returns 304 without treating it as a redirect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
    expect((await fetchFollowSafeRedirects("https://example.com/feed", {}, 1000)).status).toBe(304);
  });

  it("preserves the network timeout AbortError", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          }),
      ),
    );
    const fetching = fetchFollowSafeRedirects("https://example.com/feed", {}, 50);
    const rejection = expect(fetching).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });
});
