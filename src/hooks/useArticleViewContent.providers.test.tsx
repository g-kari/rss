import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useArticleViewContent } from "./useArticleViewContent";
import type { Article } from "../types";
vi.mock("../contexts/OgpCacheContext", () => ({
  useOgpCacheContext: () => ({ ogpCache: {}, cacheOgpEntry: vi.fn() }),
}));
afterEach(cleanup);
const article: Article = {
  id: "deck",
  feedHash: "feed",
  guid: "deck",
  title: "Deck",
  link: "https://speakerdeck.com/jnunemaker/atom",
  summary: "Summary",
  content: `<p>${"metadata ".repeat(100)}</p>`,
  createdAt: "2026-09-30T00:00:00Z",
  publishedAt: "2026-09-30T00:00:00Z",
};
it("fetches unresolved SpeakerDeck pages despite long metadata then promotes the resolved frame", () => {
  const { result, rerender } = renderHook(
    ({ html }: { html: string | null }) => useArticleViewContent(article, html, null, "light"),
    { initialProps: { html: null as string | null } },
  );
  expect(result.current.embedInfo).toBeNull();
  expect(result.current.canFetch).toBe(true);
  rerender({
    html: '<iframe src="https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3"></iframe><h2>各ページのテキスト</h2><p>Public transcript</p>',
  });
  expect(result.current.embedInfo?.type).toBe("slides");
  expect(result.current.processedContent).not.toContain("<iframe");
  expect(result.current.processedContent).toContain("Public transcript");
  expect(result.current.canFetch).toBe(false);
});
describe("published provider routes", () => {
  it.each([
    "https://www.slideshare.net/slideshow/my-talk/12345",
    "https://docs.google.com/presentation/d/e/2PACX-1vPublicPublishedExample123/pub",
  ])("renders direct supported URL %s", (link) => {
    const { result } = renderHook(() =>
      useArticleViewContent({ ...article, link }, null, null, "light"),
    );
    expect(result.current.embedInfo?.type).toBe("slides");
    expect(result.current.canFetch).toBe(true);
  });
});

it("does not restart a direct SlideShare player when canonical key metadata arrives", () => {
  const deck = { ...article, link: "https://www.slideshare.net/slideshow/my-talk/152193732" };
  const { result, rerender } = renderHook(
    ({ html }: { html: string | null }) => useArticleViewContent(deck, html, null, "light"),
    { initialProps: { html: null as string | null } },
  );
  const before = result.current.embedInfo?.embedUrl;
  rerender({
    html: '<iframe src="https://www.slideshare.net/slideshow/embed_code/key/lNgbnj7xXLMj97"></iframe><p>Transcript</p>',
  });
  expect(result.current.embedInfo?.embedUrl).toBe(before);
  expect(result.current.processedContent).toContain("Transcript");
});
