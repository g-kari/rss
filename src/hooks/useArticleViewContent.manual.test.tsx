import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useArticleViewContent } from "./useArticleViewContent";
import type { Article } from "../types";

const article: Article = {
  id: "excerpt",
  feedHash: "feed",
  guid: "excerpt",
  title: "A publisher excerpt",
  link: "https://example.com/article",
  summary: "A publisher excerpt",
  content: "",
  createdAt: "2026-10-03T00:00:00Z",
  publishedAt: "2026-10-03T00:00:00Z",
};
afterEach(cleanup);

describe("manual source-content availability", () => {
  it.each([0, 399, 400, 607, 5000])(
    "keeps %i HTML characters manually fetchable without changing automatic readiness",
    (length) => {
      const content = length ? `<p>${"a".repeat(length - 7)}</p>` : "";
      const { result } = renderHook(() =>
        useArticleViewContent({ ...article, content }, null, null, "light"),
      );
      expect(result.current.canFetchManually).toBe(true);
      expect(result.current.canFetch).toBe(length < 400);
      expect(result.current.hasFullContent).toBe(length >= 400);
    },
  );

  it("does not mistake HTML markup length for complete source text", () => {
    const content = `<p class="${"layout ".repeat(70)}">A short excerpt</p>`;
    const { result } = renderHook(() =>
      useArticleViewContent({ ...article, content }, null, null, "dark"),
    );
    expect(result.current.processedContent).toContain("A short excerpt");
    expect(result.current.canFetchManually).toBe(true);
    expect(result.current.canFetch).toBe(false);
    expect(result.current.hasFullContent).toBe(true);
  });

  it("reuses fetched content instead of offering another manual request", () => {
    const { result } = renderHook(() =>
      useArticleViewContent(article, "<p>Fetched remainder</p>", null, "light"),
    );
    expect(result.current.canFetchManually).toBe(false);
    expect(result.current.canFetch).toBe(false);
    expect(result.current.hasFullContent).toBe(true);
  });

  it.each(["", "not-a-url", "javascript:alert(1)", "http://127.0.0.1/private"])(
    "does not offer manual fetching for unsupported source %s",
    (link) => {
      const { result } = renderHook(() =>
        useArticleViewContent({ ...article, link }, null, null, "light"),
      );
      expect(result.current.canFetchManually).toBe(false);
    },
  );

  it.each([
    "https://www.youtube.com/watch?v=ABCDEFGHIJK",
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
  ])("retains native media presentation for %s", (link) => {
    const { result } = renderHook(() =>
      useArticleViewContent({ ...article, link }, null, null, "light"),
    );
    expect(result.current.canFetchManually).toBe(false);
    expect(result.current.canFetch).toBe(false);
  });

  it("keeps long slide metadata manually fetchable as before", () => {
    const { result } = renderHook(() =>
      useArticleViewContent(
        {
          ...article,
          link: "https://speakerdeck.com/jnunemaker/atom",
          content: `<p>${"metadata ".repeat(100)}</p>`,
        },
        null,
        null,
        "light",
      ),
    );
    expect(result.current.canFetchManually).toBe(true);
    expect(result.current.canFetch).toBe(true);
    expect(result.current.hasFullContent).toBe(false);
  });

  it("has no manual request without an article", () => {
    const { result } = renderHook(() => useArticleViewContent(null, null, null, "light"));
    expect(result.current.canFetchManually).toBe(false);
  });
});
