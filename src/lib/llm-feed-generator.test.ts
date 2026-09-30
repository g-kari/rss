// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inferFeedFromUrl } from "./llm-feed-generator";
import { FEED_MAX_BYTES } from "./fetch";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("inferFeedFromUrl bounded HTML", () => {
  it.each([undefined, "1", String(FEED_MAX_BYTES + 1)])(
    "rejects oversized HTML before inference (Content-Length=%s)",
    async (length) => {
      const cancel = vi.fn();
      const ai = { run: vi.fn() };
      const headers = new Headers({ "Content-Type": "text/html" });
      if (length) headers.set("Content-Length", length);
      const response = new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              controller.enqueue(new Uint8Array(FEED_MAX_BYTES + 1));
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
        { headers },
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      expect(await inferFeedFromUrl("https://example.com", ai as unknown as Ai)).toBeNull();
      expect(ai.run).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("preserves successful title/selector inference and cookie forwarding", async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: '{"articleLink":"a"}' }) };
    const html =
      '<html><head><title>Example News</title></head><body><a href="/1">Article one</a><a href="/2">Article two</a><a href="/3">Article three</a></body></html>';
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(html, { headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetch);
    const result = await inferFeedFromUrl(
      "https://example.com",
      ai as unknown as Ai,
      "session=example",
    );
    expect(result?.siteTitle).toBe("Example News");
    expect(result?.selectors.articleLink).toBe("a");
    expect(fetch.mock.calls[0][1].headers.Cookie).toBe("session=example");
    expect(ai.run).toHaveBeenCalledOnce();
  });

  it("cancels a stalled body at the existing HTML fetch timeout", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const ai = { run: vi.fn() };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    const result = inferFeedFromUrl("https://example.com", ai as unknown as Ai);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await result).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(ai.run).not.toHaveBeenCalled();
  });
});
