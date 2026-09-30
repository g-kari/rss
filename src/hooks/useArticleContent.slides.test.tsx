import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleContent } from "./useArticleContent";
import { apiFetch } from "../lib/api-fetch";
import { contentLruCache } from "../lib/lru-cache";

vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("../lib/lru-cache", () => ({ contentLruCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock("../contexts/OgpCacheContext", () => ({
  useOgpCacheContext: () => ({ ogpCache: {}, cacheOgpEntry: vi.fn() }),
}));
const url = "https://www.docswell.com/s/3402128/KVJYJ3-title";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Docswell persisted content refresh", () => {
  it("ignores the old article-id cache and stores/reuses the new transcript key", async () => {
    const cache = new Map([["id", "Old unrelated recommendations"]]);
    vi.mocked(contentLruCache.get).mockImplementation((id) => cache.get(id) ?? null);
    vi.mocked(contentLruCache.set).mockImplementation((id, html) => {
      cache.set(id, html);
    });
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ content: "New slide text" })),
    );
    const { result, unmount } = renderHook(() =>
      useArticleContent("id", url, "https://example.com/cover.jpg"),
    );
    expect(result.current.storedContent).toBeNull();
    await act(async () => {
      await result.current.fetchFullContent();
    });
    expect(contentLruCache.set).toHaveBeenCalledWith("docswell-v1:id", "New slide text");
    expect(result.current.storedContent).toBe("New slide text");
    unmount();
    const reopened = renderHook(() =>
      useArticleContent("id", url, "https://example.com/cover.jpg"),
    );
    expect(reopened.result.current.storedContent).toBe("New slide text");
    expect(apiFetch).toHaveBeenCalledOnce();
  });
});
