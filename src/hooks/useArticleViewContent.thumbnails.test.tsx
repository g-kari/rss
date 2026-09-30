import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OgpCacheProvider, useOgpCacheContext } from "../contexts/OgpCacheContext";
import GalleryCardRenderer from "../components/article-list-body/GalleryCardRenderer";
import { GalleryItemCtx } from "../components/article-list-body/gallery-context";
import { STORAGE_KEYS } from "../lib/storage";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import type { Article } from "../types";
import { useArticleListItemProps } from "./useArticleListItemProps";
import { useArticleViewContent } from "./useArticleViewContent";
import { useOgpCache } from "./useOgpCache";

const article: Article = {
  id: "body-image",
  feedHash: "feed",
  guid: "body-image",
  title: "Body image article",
  link: "https://example.com/article",
  summary: "",
  createdAt: "2026-09-30T00:00:00Z",
  publishedAt: "2026-09-30T00:00:00Z",
};
const image = "/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fhero.jpg";
const body = `<p>Article body</p><img src="${image}" width="1200" height="800">`;
const emptyArticles: Article[] = [];
const articles = [article];
const feedMap = new Map();
const emptyIds = new Set<string>();
const noop = () => {};
const galleryImagesForItem = () => undefined;

function Provider({ children }: { children: ReactNode }) {
  const cache = useOgpCache(emptyArticles);
  return <OgpCacheProvider value={cache}>{children}</OgpCacheProvider>;
}

// Match ArticleList's memoized context and real memoized virtual-gallery renderer.
// Rerendering a parent alone must not be enough to make this regression pass.
function Gallery() {
  const { ogpCache } = useOgpCacheContext();
  const { resolveItemProps } = useArticleListItemProps({
    articles,
    feedMap,
    readIds: emptyIds,
    readBeforeTimestamp: null,
    bookmarkIds: emptyIds,
    showFeedName: false,
    query: "",
    filteredCount: 1,
    ogpCache,
    onSelectArticle: noop,
    onToggleRead: noop,
    onToggleBookmark: noop,
    onContextMenu: noop,
  });
  const context = useMemo(
    () => ({
      resolveItemProps,
      galleryImagesForItem,
      galleryMinImagePx: 0,
      deletingIds: emptyIds,
      newIds: emptyIds,
      galleryFailedIds: emptyIds,
      galleryExpandingIds: emptyIds,
      galleryRetryArticle: noop,
      onGalleryContextMenu: noop,
      onGalleryLongPress: noop,
    }),
    [resolveItemProps],
  );
  return (
    <GalleryItemCtx.Provider value={context}>
      <GalleryCardRenderer data={article} index={0} width={400} />
    </GalleryItemCtx.Provider>
  );
}

function Detail({ content }: { content: string | null }) {
  useArticleViewContent(article, content, null, "light");
  const { cacheOgpEntry } = useOgpCacheContext();
  return <button onClick={() => cacheOgpEntry(article.link!, { image })}>Resolve OGP image</button>;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("body image to shared gallery thumbnail", () => {
  it("keeps a SingleFile private body image on the authenticated local route when promoting it", () => {
    const privateImage = `/api/clip/images/${"a".repeat(64)}`;
    const content = `<img src="${privateImage}" width="1200" height="800">`;
    const { result } = renderHook(
      () => {
        useArticleViewContent(article, content, null, "light");
        return useOgpCacheContext();
      },
      { wrapper: Provider },
    );
    expect(result.current.ogpCache[article.link!]).toBe(privateImage);
    expect(buildImageProxyUrl(result.current.ogpCache[article.link!])).toBe(privateImage);
  });

  it("updates an already rendered memoized gallery when OGP arrives", () => {
    render(
      <Provider>
        <Gallery />
        <Detail content={null} />
      </Provider>,
    );
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Resolve OGP image" }).click());
    expect(screen.queryByText(/no image/i)).not.toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", image);
  });

  it("repairs an OGP miss from fetched body content without another request or selection", async () => {
    localStorage.setItem(
      STORAGE_KEYS.OGP_CACHE,
      JSON.stringify({ [article.link!]: { image: "" } }),
    );
    const { rerender } = render(
      <Provider>
        <Gallery />
        <Detail content={null} />
      </Provider>,
    );
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    rerender(
      <Provider>
        <Gallery />
        <Detail content={body} />
      </Provider>,
    );
    expect(screen.queryByText(/no image/i)).not.toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", image);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.OGP_CACHE)!)[article.link!].image).toBe(
      image,
    );
  });

  it.each(["stored", "feed"])(
    "repairs thumbnails from %s content already available at mount",
    (source) => {
      const { result } = renderHook(
        () => {
          useArticleViewContent(
            source === "feed" ? { ...article, content: body } : article,
            source === "stored" ? body : null,
            null,
            "light",
          );
          return useOgpCacheContext();
        },
        { wrapper: Provider },
      );
      expect(result.current.ogpCache[article.link!]).toBe(image);
    },
  );

  it.each(["rss", "ogp"])("preserves an existing %s thumbnail", (source) => {
    const existing = "https://example.com/ogp.jpg";
    if (source === "ogp") {
      localStorage.setItem(STORAGE_KEYS.OGP_CACHE, JSON.stringify({ [article.link!]: existing }));
    }
    const { result } = renderHook(
      () => {
        useArticleViewContent(
          { ...article, ogImage: source === "rss" ? existing : undefined },
          body,
          null,
          "light",
        );
        return useOgpCacheContext();
      },
      { wrapper: Provider },
    );
    expect(result.current.ogpCache[article.link!]).toBe(source === "ogp" ? existing : undefined);
  });

  it("does not promote trackers, data placeholders, or an absent article", () => {
    const tiny =
      '<img src="https://example.com/pixel.gif" width="1" height="1"><img src="data:image/png;base64,aA==">';
    const { result, rerender } = renderHook(
      ({ current, content }: { current: Article | null; content: string }) => {
        useArticleViewContent(current, content, null, "light");
        return useOgpCacheContext();
      },
      { initialProps: { current: article as Article | null, content: tiny }, wrapper: Provider },
    );
    expect(result.current.ogpCache).toEqual({});
    rerender({ current: null, content: body });
    expect(result.current.ogpCache).toEqual({});
  });
});
