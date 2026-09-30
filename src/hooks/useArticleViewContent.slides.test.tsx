import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useArticleViewContent } from "./useArticleViewContent";
import type { Article } from "../types";

vi.mock("../contexts/OgpCacheContext", () => ({
  useOgpCacheContext: () => ({ ogpCache: {}, cacheOgpEntry: vi.fn() }),
}));
afterEach(cleanup);
const article: Article = {
  id: "slides",
  feedHash: "feed",
  guid: "slides",
  title: "Slides",
  link: "https://www.docswell.com/s/3402128/KVJYJ3-2026-09-15-202358?__readwiseLocation=#p1",
  summary: "Summary",
  content: `<p>${"Deck metadata ".repeat(50)}</p>`,
  createdAt: "2026-09-30T00:00:00Z",
  publishedAt: "2026-09-30T00:00:00Z",
};

describe("slide article content", () => {
  it("keeps transcript fetching available even with a player and a long RSS description", () => {
    const { result } = renderHook(() => useArticleViewContent(article, null, null, "light"));
    expect(result.current.embedInfo?.type).toBe("slides");
    expect(result.current.canFetch).toBe(true);
    expect(result.current.hasFullContent).toBe(false);
  });
  it("renders the fetched transcript without a duplicate player and stops fetching", () => {
    const full =
      '<iframe src="https://www.docswell.com/slide/KVJYJ3/embed"></iframe><h2>各ページのテキスト</h2><p>Readable slides</p>';
    const { result } = renderHook(() => useArticleViewContent(article, full, null, "light"));
    expect(result.current.processedContent).not.toContain("<iframe");
    expect(result.current.processedContent).toContain("Readable slides");
    expect(result.current.canFetch).toBe(false);
    expect(result.current.hasFullContent).toBe(true);
  });
  it("preserves the existing video-only fetch gate", () => {
    const { result } = renderHook(() =>
      useArticleViewContent(
        { ...article, link: "https://www.youtube.com/watch?v=T-TuEmg8MIo", content: "" },
        null,
        null,
        "light",
      ),
    );
    expect(result.current.embedInfo?.type).toBe("video");
    expect(result.current.canFetch).toBe(false);
  });
});
