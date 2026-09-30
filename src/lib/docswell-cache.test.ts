// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildContentCacheKey, buildClipCacheKey, extractContent } from "./fetch-article-content";
import { fetchMarkdownFromHtml } from "./content";

vi.mock("./content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./content")>()),
  fetchMarkdownFromHtml: vi.fn().mockResolvedValue("Unrelated AI fallback"),
}));
const url = "https://www.docswell.com/s/3402128/KVJYJ3-title";

describe("Docswell cache and extraction integration", () => {
  it("bypasses old server extraction caches only for validated Docswell URLs", async () => {
    expect(
      new URL((await buildContentCacheKey("https://rss.0g0.xyz", url)).url).pathname,
    ).toContain("/content/docswell-v1/");
    expect(
      new URL(
        (await buildContentCacheKey("https://rss.0g0.xyz", "https://example.com/article")).url,
      ).pathname,
    ).toContain("/content/v2/");
    expect(
      new URL((await buildClipCacheKey("https://rss.0g0.xyz", "user", url)).url).pathname,
    ).toContain("/clip/user/");
  });
  it("keeps short/image-only decks instead of replacing the safe viewer with AI markdown", async () => {
    const html = "<article><p>Short slide description</p></article>";
    const result = await extractContent(new TextEncoder().encode(html), "text/html", url);
    expect(result.content).toContain("https://www.docswell.com/slide/KVJYJ3/embed");
    expect(result.content).toContain("Short slide description");
    expect(fetchMarkdownFromHtml).not.toHaveBeenCalled();
  });
});
