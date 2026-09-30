import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ArticleRecommendations from "./ArticleRecommendations";
import { OgpCacheProvider } from "../contexts/OgpCacheContext";
import type { Article, Feed } from "../types";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const feeds: Feed[] = ["a", "b", "c"].map((id) => ({
  id,
  title: `Feed ${id}`,
  url: `https://${id}.example/feed`,
  siteUrl: `https://${id}.example`,
  lastFetchedAt: null,
  fetchError: null,
}));
const articles: Article[] = feeds.map((feed) => ({
  id: feed.id,
  feedHash: feed.id,
  title: `記事 ${feed.id}`,
  link: `${feed.siteUrl}/article`,
  guid: feed.id,
  summary: "",
  publishedAt: new Date(NOW - 3600000).toISOString(),
  createdAt: new Date(NOW - 3600000).toISOString(),
}));
const props = {
  userId: "one",
  candidates: articles,
  articles,
  feeds,
  readIds: new Set<string>(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  likeIds: new Set<string>(),
  historyIds: new Set<string>(),
  onSelectArticle: vi.fn(),
};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ArticleRecommendations", () => {
  it("shows explanations and opens the selected article in the existing reader", () => {
    render(<ArticleRecommendations {...props} />);
    expect(screen.getAllByText("24時間以内の新着")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "記事 aを読む" }));
    expect(props.onSelectArticle).toHaveBeenCalledWith(articles[0]);
  });
  it("dismisses independently, announces feedback, and supports undo", () => {
    render(<ArticleRecommendations {...props} />);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole("button", { name: "記事 aに興味なし" }));
    expect(screen.queryByRole("button", { name: "記事 aを読む" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("おすすめから外しました");
    expect(screen.getByRole("button", { name: "元に戻す" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(screen.getByRole("button", { name: "おすすめを折りたたむ" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "記事 aを読む" })).toBeInTheDocument();
  });
  it("can collapse and reopen without losing recommendations", () => {
    render(<ArticleRecommendations {...props} />);
    const disclosure = screen.getByRole("button", { name: "おすすめを折りたたむ" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(disclosure);
    expect(screen.queryByRole("button", { name: "記事 aを読む" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "おすすめを表示" }));
    expect(screen.getByRole("button", { name: "記事 aを読む" })).toBeInTheDocument();
  });
  it("keeps controls available when all suggestions are dismissed", () => {
    render(<ArticleRecommendations {...props} />);
    for (const article of articles)
      fireEvent.click(screen.getByRole("button", { name: `${article.title}に興味なし` }));
    expect(screen.getByText("いま紹介できる未読記事はありません")).toBeInTheDocument();
    fireEvent.click(screen.getByText("選び方・おすすめの調整"));
    fireEvent.click(screen.getByRole("button", { name: "非表示にしたおすすめをリセット" }));
    expect(screen.getAllByRole("button", { name: /を読む$/ })).toHaveLength(3);
  });
  it("account changes reset feedback and collapse state", () => {
    const { rerender } = render(<ArticleRecommendations {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "記事 aに興味なし" }));
    rerender(<ArticleRecommendations {...props} userId="two" />);
    expect(screen.getByRole("button", { name: "記事 aを読む" })).toBeInTheDocument();
    expect(within(screen.getByRole("status")).queryByText("元に戻す")).not.toBeInTheDocument();
  });
  it("does not recommend read articles, and stays out of filtered/search views", () => {
    const { rerender } = render(<ArticleRecommendations {...props} readIds={new Set(["a"])} />);
    expect(screen.queryByRole("button", { name: "記事 aを読む" })).not.toBeInTheDocument();
    rerender(<ArticleRecommendations {...props} enabled={false} />);
    expect(screen.queryByRole("region", { name: "いま読むおすすめ" })).not.toBeInTheDocument();
  });
  it("never recommends a retained active article outside the strict source scope", () => {
    render(<ArticleRecommendations {...props} articles={articles.slice(1)} />);
    expect(screen.queryByRole("button", { name: "記事 aを読む" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /を読む$/ })).toHaveLength(2);
  });
});

describe("ArticleRecommendations thumbnails", () => {
  const imageArticle = { ...articles[0], ogImage: "https://images.example/article.jpg" };
  function only(article: Article) {
    return { ...props, candidates: [article], articles: [article] };
  }

  it("renders the feed thumbnail through the existing image proxy with decorative semantics", () => {
    render(<ArticleRecommendations {...only(imageArticle)} />);
    const read = screen.getByRole("button", { name: "記事 aを読む" });
    const image = read.querySelector("img");
    expect(image).toHaveAttribute(
      "src",
      "/api/image-proxy?url=https%3A%2F%2Fimages.example%2Farticle.jpg",
    );
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveClass("w-16", "h-12", "flex-shrink-0");
    fireEvent.click(read);
    expect(props.onSelectArticle).toHaveBeenCalledWith(imageArticle);
  });

  it("keeps a fixed-size placeholder for missing/unsafe images, without an empty image request", () => {
    for (const ogImage of [
      undefined,
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "http://127.0.0.1/image.png",
    ]) {
      const { unmount } = render(<ArticleRecommendations {...only({ ...articles[0], ogImage })} />);
      const read = screen.getByRole("button", { name: "記事 aを読む" });
      expect(read.querySelector("img")).toBeNull();
      const placeholder = read.querySelector('[aria-hidden="true"]');
      expect(placeholder).toHaveClass("w-16", "h-12", "flex-shrink-0");
      expect(placeholder?.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("replaces a failed image without shifting layout, then retries when the URL changes", () => {
    const { rerender } = render(<ArticleRecommendations {...only(imageArticle)} />);
    const read = screen.getByRole("button", { name: "記事 aを読む" });
    fireEvent.error(read.querySelector("img")!);
    expect(read.querySelector("img")).toBeNull();
    expect(read.querySelector('[aria-hidden="true"]')).toHaveClass("w-16", "h-12");
    rerender(
      <ArticleRecommendations
        {...only({ ...imageArticle, ogImage: "https://images.example/new.jpg" })}
      />,
    );
    expect(read.querySelector("img")).toHaveAttribute("src", expect.stringContaining("new.jpg"));
  });
});

describe("ArticleRecommendations thumbnail resolution", () => {
  function withCache(article: Article, image: string) {
    return (
      <OgpCacheProvider
        value={{
          ogpCache: { [article.link!]: image },
          getEntry: () => undefined,
          cacheOgpEntry: () => {},
        }}
      >
        <ArticleRecommendations {...props} candidates={[article]} articles={[article]} />
      </OgpCacheProvider>
    );
  }

  it("uses the shared OGP cache ahead of feed images and reacts to cache updates", () => {
    const article = { ...articles[0], ogImage: "https://images.example/feed.jpg" };
    const { rerender } = render(withCache(article, "https://images.example/ogp.jpg"));
    const read = screen.getByRole("button", { name: "記事 aを読む" });
    expect(read.querySelector("img")).toHaveAttribute("src", expect.stringContaining("ogp.jpg"));
    rerender(withCache(article, "https://images.example/new-ogp.jpg"));
    expect(read.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("new-ogp.jpg"),
    );
  });

  it("uses the existing YouTube fallback and does not double-wrap an already proxied URL", () => {
    const article = { ...articles[0], link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
    const { rerender } = render(withCache(article, ""));
    const read = screen.getByRole("button", { name: "記事 aを読む" });
    expect(read.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("i.ytimg.com"),
    );
    const proxied = "/api/image-proxy?url=https%3A%2F%2Fimages.example%2Fcached.jpg";
    rerender(withCache(article, proxied));
    expect(read.querySelector("img")).toHaveAttribute("src", proxied);
    rerender(withCache(article, "/api/image-proxy?url=javascript%3Aalert(1)"));
    expect(read.querySelector("img")).toBeNull();
  });
});
