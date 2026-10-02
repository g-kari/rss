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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(
      screen.getByText("現在のフィルターに合う未読のおすすめ記事はありません"),
    ).toBeInTheDocument();
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
  it("does not recommend read articles, and respects explicitly disabled hosts", () => {
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
  it.each([0, 1, 2])(
    "keeps the section and mode discoverable with %s scoped candidates",
    (count) => {
      render(<ArticleRecommendations {...props} candidates={articles.slice(0, count)} />);
      expect(screen.getByRole("region", { name: "いま読むおすすめ" })).toBeInTheDocument();
      expect(screen.queryAllByRole("button", { name: /を読む$/ })).toHaveLength(count);
      const entry = screen.getByRole("button", { name: "ドパガキモード" });
      expect(entry).toBeEnabled();
      entry.focus();
      fireEvent.click(entry);
      expect(screen.getByRole("dialog", { name: "ドパガキモード" })).toBeInTheDocument();
      expect(document.querySelectorAll(".immersive-slide")).toHaveLength(count);
      fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(entry).toHaveFocus();
      expect(props.onSelectArticle).not.toHaveBeenCalled();
    },
  );
  it.each(["loading", "error", "searching"] as const)(
    "keeps an explained entry and cancels playback during %s interruptions",
    (status) => {
      const { rerender } = render(<ArticleRecommendations {...props} scopeKey="first" />);
      const entry = screen.getByRole("button", { name: "ドパガキモード" });
      entry.focus();
      fireEvent.click(entry);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      rerender(<ArticleRecommendations {...props} status={status} scopeKey="first" />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "いま読むおすすめ" })).toBeInTheDocument();
      expect(entry).toBeDisabled();
      expect(screen.getByRole("button", { name: "おすすめを折りたたむ" })).toHaveFocus();
      expect(screen.queryAllByRole("button", { name: /を読む$/ })).toHaveLength(0);
      expect(
        screen.getByText(/記事を読み込み中|記事を読み込めませんでした|検索条件を反映/),
      ).toBeVisible();
      rerender(<ArticleRecommendations {...props} scopeKey="first" />);
      expect(entry).toBeEnabled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
  it("closes on scope changes, preserves disclosure, and only reopens the new scope explicitly", () => {
    const { rerender } = render(<ArticleRecommendations {...props} scopeKey="first" />);
    fireEvent.click(screen.getByRole("button", { name: "おすすめを折りたたむ" }));
    const entry = screen.getByRole("button", { name: "ドパガキモード" });
    entry.focus();
    fireEvent.click(entry);
    rerender(<ArticleRecommendations {...props} scopeKey="second" candidates={[articles[1]]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(entry).toHaveFocus();
    expect(screen.getByRole("button", { name: "おすすめを表示" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(entry);
    expect(document.querySelectorAll(".immersive-slide")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "記事 b" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "記事 a" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(entry).toHaveFocus();
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

it("preserves the remaining play queue after an explicit full-reader departure without global hide/read mutations", () => {
  const read = vi.fn();
  render(<ArticleRecommendations {...props} onReadArticle={read} />);
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
  expect(read).toHaveBeenCalledWith(articles[1]);
  expect(props.onSelectArticle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  expect(screen.getByRole("heading", { name: "記事 c" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "記事 a" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "記事 b" })).toBeNull();
  expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("1 / 1件");
});
it("resets remaining queues on account/scope changes and rechecks current eligible sources on reopen", () => {
  const { rerender } = render(<ArticleRecommendations {...props} scopeKey="first" />);
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
  rerender(
    <ArticleRecommendations
      {...props}
      scopeKey="second"
      candidates={[articles[0]]}
      articles={[articles[0]]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  expect(screen.getByRole("heading", { name: "記事 a" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
  rerender(<ArticleRecommendations {...props} scopeKey="second" readIds={new Set(["a"])} />);
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  expect(screen.queryByRole("heading", { name: "記事 a" })).toBeNull();
});

it("starts newly available candidates when reopening a session that has never contained any articles", () => {
  const { rerender } = render(<ArticleRecommendations {...props} candidates={[]} />);
  const entry = screen.getByRole("button", { name: "ドパガキモード" });
  fireEvent.click(entry);
  expect(document.querySelectorAll(".immersive-slide")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
  rerender(<ArticleRecommendations {...props} candidates={[articles[0]]} />);
  fireEvent.click(entry);
  expect(screen.getByRole("heading", { name: "記事 a" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  // The revived first batch is served once, not replayed as an unseen next batch.
  expect(screen.queryByRole("button", { name: "次の10件を見る" })).toBeNull();
});

it("adds same-scope candidates without replacing the current card or replaying consumed items", () => {
  const { rerender } = render(<ArticleRecommendations {...props} candidates={[articles[0]]} />);
  const entry = screen.getByRole("button", { name: "ドパガキモード" });
  fireEvent.click(entry);
  rerender(<ArticleRecommendations {...props} candidates={articles} />);
  expect(document.querySelectorAll(".immersive-slide")).toHaveLength(3);
  expect(screen.getByRole("heading", { name: "記事 a" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
  fireEvent.click(entry);
  expect(document.querySelectorAll(".immersive-slide")).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: "記事 a" })).toBeNull();
});

it("resumes an exhausted session with newly arrived candidates but never restarts served articles", () => {
  const { rerender } = render(<ArticleRecommendations {...props} candidates={[articles[0]]} />);
  const entry = screen.getByRole("button", { name: "ドパガキモード" });
  fireEvent.click(entry);
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  fireEvent.click(screen.getByRole("button", { name: "ここで終わる" }));
  rerender(<ArticleRecommendations {...props} candidates={articles} />);
  fireEvent.click(entry);
  expect(document.querySelectorAll(".immersive-slide")).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: "記事 a" })).toBeNull();
});

describe("recommendation reasons and reversible topic controls", () => {
  const topical = articles.map((article, index) => ({
    ...article,
    categories: [index === 2 ? "Unity" : "Cooking"],
  }));
  const topicalProps = { ...props, candidates: topical, articles: topical };
  const order = () =>
    within(screen.getByRole("region", { name: "いま読むおすすめ" }))
      .getAllByRole("button", { name: /を読む$/ })
      .map((button) => button.getAttribute("aria-label"));
  it("exposes actual source reasons and changes rank immediately, with stable dialog and undo", () => {
    render(<ArticleRecommendations {...topicalProps} />);
    fireEvent.click(screen.getByRole("button", { name: "記事 cをおすすめした理由" }));
    const dialog = screen.getByRole("dialog", { name: "この記事をおすすめした理由" });
    expect(within(dialog).getByText(/興味との一致/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("一致する閲覧・保存・いいねのカテゴリなし");
    expect(order()[0]).toBe("記事 aを読む");
    fireEvent.click(within(dialog).getByRole("button", { name: "話題の調整を元に戻す" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unityの話題を増やす" }));
    expect(order()[0]).toBe("記事 cを読む");
    expect(within(dialog).getByRole("button", { name: "Unityの話題を増やす" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "話題の調整を元に戻す" }));
    expect(order()[0]).toBe("記事 aを読む");
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "閉じる" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "おすすめを折りたたむ" })).toHaveFocus();
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  });
  it("keeps global reset reachable for an empty pool and isolates account changes", () => {
    const { rerender } = render(<ArticleRecommendations {...topicalProps} />);
    fireEvent.click(screen.getByRole("button", { name: "記事 cをおすすめした理由" }));
    const dialog = screen.getByRole("dialog", { name: "この記事をおすすめした理由" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unityの話題を減らす" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    rerender(<ArticleRecommendations {...topicalProps} candidates={[]} scopeKey="empty" />);
    fireEvent.click(screen.getByText("選び方・おすすめの調整"));
    fireEvent.click(screen.getByRole("button", { name: "話題の調整をすべてリセット" }));
    expect(screen.queryByRole("group", { name: "Unityのおすすめ調整" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "話題の調整を元に戻す" }));
    expect(screen.getByRole("group", { name: "Unityのおすすめ調整" })).toBeInTheDocument();
    rerender(<ArticleRecommendations {...topicalProps} userId="two" />);
    expect(screen.queryByRole("group", { name: "Unityのおすすめ調整" })).not.toBeInTheDocument();
    expect(order()[0]).toBe("記事 aを読む");
  });
  it("does not infer topic controls when metadata is absent, and closes on scope interruption", () => {
    const { rerender } = render(<ArticleRecommendations {...props} scopeKey="one" />);
    fireEvent.click(screen.getByRole("button", { name: "記事 aをおすすめした理由" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("カテゴリがありません");
    expect(screen.queryByRole("button", { name: /の話題を増やす/ })).not.toBeInTheDocument();
    rerender(<ArticleRecommendations {...props} scopeKey="two" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("uses preferences for immersive launch and pauses nested reasons without changing selection", () => {
    render(<ArticleRecommendations {...topicalProps} />);
    fireEvent.click(screen.getByRole("button", { name: "記事 cをおすすめした理由" }));
    fireEvent.click(screen.getByRole("button", { name: "Unityの話題を増やす" }));
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
    const immersive = screen.getByRole("dialog", { name: "ドパガキモード" });
    const trigger = within(immersive).getByRole("button", { name: "おすすめ理由" });
    expect(within(immersive).getByRole("heading", { name: "記事 c" })).toBeInTheDocument();
    trigger.focus();
    fireEvent.click(trigger);
    const reasons = screen.getByRole("dialog", { name: "この記事をおすすめした理由" });
    expect(reasons).toHaveTextContent("Unity」を増やす");
    expect(immersive).toHaveAttribute("aria-modal", "false");
    fireEvent.click(within(reasons).getByRole("button", { name: "Unityの話題を減らす" }));
    act(() => vi.advanceTimersByTime(30000));
    expect(within(immersive).getByRole("heading", { name: "記事 c" })).toBeInTheDocument();
    fireEvent.keyDown(within(reasons).getByRole("button", { name: "閉じる" }), { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "この記事をおすすめした理由" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(immersive).toHaveAttribute("aria-modal", "true");
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  });
});
