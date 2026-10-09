import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../../e2e/helpers/article";
import { useArticleListItemProps } from "../../hooks/useArticleListItemProps";
import { buildImageProxyUrl } from "../../lib/image-proxy-url";
import type { Article, Feed } from "../../types";
import { CardArticleItem } from "./CardItem";
import { ListArticleItem } from "./ListItem";
import { MagazineFeaturedArticleItem } from "./MagazineItem";
import type { ArticleItemProps } from "./shared";

const cachedImage = "https://images.example.test/broken-ogp.jpg";
const feedImage = "https://images.example.test/feed.jpg";
const lateImage = "https://images.example.test/late-ogp.jpg";
const videoId = "dQw4w9WgXcQ";
const youtubeImage = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
const feedMap = new Map<string, Feed>();
const emptyIds = new Set<string>();
const noop = () => {};

// Resolve the same props as ArticleList; do not supply fallback candidates in the test.
function Item({
  Renderer,
  article,
  ogpCache,
}: {
  Renderer: ComponentType<ArticleItemProps>;
  article: Article;
  ogpCache: Record<string, string>;
}) {
  const { resolveItemProps } = useArticleListItemProps({
    articles: [article],
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
  return <Renderer {...resolveItemProps(article, 0)} />;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network request"))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each([
  ["List", ListArticleItem],
  ["Card", CardArticleItem],
  ["Magazine", MagazineFeaturedArticleItem],
] as const)("%s thumbnail candidate composition", (_name, Renderer) => {
  it("falls back from cached OGP to the existing feed image without fetching metadata", () => {
    const article = makeArticle({ ogImage: feedImage });
    const { container } = render(
      <Item Renderer={Renderer} article={article} ogpCache={{ [article.link!]: cachedImage }} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", buildImageProxyUrl(cachedImage));
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveAttribute("src", buildImageProxyUrl(feedImage));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tries OGP, feed, and YouTube once before a stable placeholder", () => {
    const article = makeArticle({
      link: `https://www.youtube.com/watch?v=${videoId}`,
      ogImage: feedImage,
    });
    const cache = { [article.link!]: cachedImage };
    const { container, rerender } = render(
      <Item Renderer={Renderer} article={article} ogpCache={cache} />,
    );
    for (const candidate of [cachedImage, feedImage, youtubeImage]) {
      expect(container.querySelector("img")).toHaveAttribute("src", buildImageProxyUrl(candidate));
      fireEvent.error(container.querySelector("img")!);
    }
    expect(container.querySelector("img")).toBeNull();
    rerender(<Item Renderer={Renderer} article={article} ogpCache={{ ...cache }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('span[aria-hidden="true"] svg')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates raw/proxy-equivalent candidates before YouTube and does not retry them", () => {
    const article = makeArticle({
      link: `https://www.youtube.com/watch?v=${videoId}`,
      ogImage: buildImageProxyUrl(cachedImage),
    });
    const { container, rerender } = render(
      <Item Renderer={Renderer} article={article} ogpCache={{ [article.link!]: cachedImage }} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveAttribute("src", buildImageProxyUrl(youtubeImage));
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(
      <Item
        Renderer={Renderer}
        article={article}
        ogpCache={{ [article.link!]: buildImageProxyUrl(cachedImage) }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a loaded feed image and its DOM node when late cached OGP arrives", () => {
    const article = makeArticle({ ogImage: feedImage });
    const { container, rerender } = render(
      <Item Renderer={Renderer} article={article} ogpCache={{}} />,
    );
    const loadedImage = container.querySelector("img")!;
    expect(loadedImage).toHaveAttribute("src", buildImageProxyUrl(feedImage));
    fireEvent.load(loadedImage);
    rerender(
      <Item Renderer={Renderer} article={article} ogpCache={{ [article.link!]: lateImage }} />,
    );
    expect(container.querySelector("img")).toBe(loadedImage);
    expect(loadedImage).toHaveAttribute("src", buildImageProxyUrl(feedImage));
    expect(fetch).not.toHaveBeenCalled();
  });
});
