import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import ImmersiveArticleMode from "./ImmersiveArticleMode";
import { VisualModeProvider } from "../contexts/VisualModeContext";
import ArticleRecommendations from "./ArticleRecommendations";
import { getPopupOpenCount } from "../lib/popup-lock";
import { contentLruCache } from "../lib/lru-cache";
import { getProviderContentCacheId } from "../lib/slide-providers";
import type { Article, Feed } from "../types";

const now = Date.parse("2026-09-30T12:00:00Z");
const articles: Article[] = Array.from({ length: 23 }, (_, i) => ({
  id: String(i),
  feedHash: "a",
  guid: String(i),
  title: `記事 ${i}`,
  link: `https://example.com/${i}`,
  summary: "<p>既存の説明 &amp; 要点</p>",
  publishedAt: new Date(now - i * 1000).toISOString(),
  createdAt: new Date(now).toISOString(),
  ogImage: "https://example.com/image.png",
}));
const feeds: Feed[] = [
  {
    id: "a",
    title: "Feed",
    url: "https://example.com/feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
  },
];
const props = {
  candidates: articles,
  articles,
  feeds,
  readIds: new Set<string>(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  likeIds: new Set<string>(),
  historyIds: new Set<string>(),
  dismissedIds: new Set<string>(),
  now,
  onClose: vi.fn(),
  onSelectArticle: vi.fn(),
  onToggleReadingList: vi.fn(),
  onDismiss: vi.fn(),
  onRestore: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness() {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissed] = useState(new Set<string>());
  const [readingListIds, setSaved] = useState(new Set<string>());
  return (
    <>
      <button onClick={() => setOpen(true)}>開始</button>
      {open && (
        <ImmersiveArticleMode
          {...props}
          dismissedIds={dismissedIds}
          readingListIds={readingListIds}
          onClose={() => setOpen(false)}
          onDismiss={(id) => setDismissed(new Set([id]))}
          onRestore={() => setDismissed(new Set())}
          onToggleReadingList={(id) => setSaved(readingListIds.has(id) ? new Set() : new Set([id]))}
        />
      )}
    </>
  );
}
function start() {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "開始" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}
function advance(count: number) {
  for (let i = 0; i < count; i++) fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
}

describe("ImmersiveArticleMode", () => {
  it("shows one accessible article with only neighboring media and extracts only the active article", async () => {
    render(<ImmersiveArticleMode {...props} />);
    expect(screen.getByRole("heading", { name: "記事 0" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getAllByText("既存の説明 & 要点", { exact: false })).toHaveLength(2);
    expect(document.querySelector("audio, video, iframe")).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/content?url=");
    expect(props.onSelectArticle).not.toHaveBeenCalled();
    expect(getPopupOpenCount()).toBe(1);
  });
  it("shows extracted body images without opening the inline reader", async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            content: '<p>取得した記事本文</p><img src="https://example.com/extracted.jpg">',
          }),
        ),
    );
    const source = { ...articles[0], id: "extracted", ogImage: undefined };
    render(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);
    await waitFor(() => {
      expect(document.querySelector('img[src*="extracted.jpg"]')).not.toBeNull();
    });
    expect(screen.queryByRole("dialog", { name: "ここで記事の本文を読む" })).toBeNull();
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/api/content?")),
    ).toHaveLength(1);
  });
  it("retains supplied responsive feed images when cached fulltext has no images", () => {
    const small = "https://example.com/preserved-cover-300x168.webp";
    const large = "https://example.com/preserved-cover-1600x900.webp";
    const source = {
      ...articles[0],
      id: "preserve-responsive-feed-image",
      ogImage: small,
      content: `<img src="${small}" srcset="${large} 1600w, ${small} 300w">`,
    };
    contentLruCache.set(
      getProviderContentCacheId(source.id, source.link),
      "<p>取得済み全文には画像がありません。</p>",
    );

    render(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);

    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(large)),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the loaded feed body image after OGP fails with image-free cached fulltext", () => {
    const body = "https://example.com/preserved-body.svg";
    const source = {
      ...articles[0],
      id: "preserve-feed-body-fallback",
      ogImage: "https://example.com/broken-preserved-ogp.jpg",
      content: `<img src="/api/image-proxy?url=%ZZ.jpg"><img src="${body}" width="800" height="450">`,
    };
    contentLruCache.set(
      getProviderContentCacheId(source.id, source.link),
      "<p>取得済み全文には画像がありません。</p>",
    );

    render(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);
    fireEvent.error(document.querySelector(".cinematic-image img")!);

    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(body)),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps cached-body then feed-body image order without admitting unsafe candidates", () => {
    const cached = "https://example.com/preserved-cached-body.jpg";
    const feed = "https://example.com/preserved-feed-body.jpg";
    const source = {
      ...articles[0],
      id: "preserve-cached-and-feed-image-order",
      ogImage: "https://example.com/broken-order-ogp.jpg",
      content: `<img src="/api/image-proxy?url=%ZZ.jpg"><img src="${feed}" width="800" height="450">`,
      summary: "",
    };
    contentLruCache.set(
      getProviderContentCacheId(source.id, source.link),
      `<img src="http://127.0.0.1/private.jpg"><img src="${cached}" width="800" height="450">`,
    );

    render(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);
    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(source.ogImage)),
    );
    fireEvent.error(document.querySelector(".cinematic-image img")!);
    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(cached)),
    );
    fireEvent.error(document.querySelector(".cinematic-image img")!);
    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(feed)),
    );
    fireEvent.error(document.querySelector(".cinematic-image img")!);
    expect(document.querySelector(".cinematic-image img")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains the current loaded body image after the shared content cache evicts it", () => {
    const loaded = "https://example.com/preserved-retained-body.jpg";
    const feed = "https://example.com/preserved-feed-after-eviction.jpg";
    const source = {
      ...articles[0],
      id: "preserve-loaded-body-after-eviction",
      ogImage: "https://example.com/broken-eviction-ogp.jpg",
      content: `<img src="${feed}" width="800" height="450">`,
    };
    const cacheKey = getProviderContentCacheId(source.id, source.link);
    contentLruCache.set(cacheKey, `<img src="${loaded}" width="800" height="450">`);

    const view = render(
      <ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />,
    );
    fireEvent.error(document.querySelector(".cinematic-image img")!);
    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(loaded)),
    );

    for (let i = 0; i < 15; i++)
      contentLruCache.set(`image-preservation-eviction-${i}`, "<p>別の記事</p>");
    expect(contentLruCache.get(cacheKey)).toBeNull();
    view.rerender(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);

    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(loaded)),
    );
    fireEvent.error(document.querySelector(".cinematic-image img")!);
    expect(document.querySelector(".cinematic-image img")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent(feed)),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("continues through all loaded articles without a next-batch confirmation", () => {
    render(<ImmersiveArticleMode {...props} />);
    advance(10);
    expect(screen.getByRole("heading", { name: "記事 10" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("11 / 20件");
    advance(10);
    expect(screen.getByRole("status")).toHaveTextContent("21 / 23件");
    advance(3);
    expect(screen.getByRole("heading", { name: "読み込み済みの記事はここまで" })).toBeVisible();
    expect(screen.getByRole("button", { name: "次の記事" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "次の10件を見る" })).toBeNull();
    expect(props.onSelectArticle).not.toHaveBeenCalled();
    expect(props.onDismiss).not.toHaveBeenCalled();
  });
  it("responds to native vertical scrolling and rapid keyboard changes without selection/read side effects", () => {
    render(<ImmersiveArticleMode {...props} />);
    const scroller = screen.getByRole("region", { name: "おすすめ記事を縦にスワイプ" });
    Object.defineProperty(scroller, "clientHeight", { value: 400 });
    scroller.scrollTop = 400;
    fireEvent.scroll(scroller);
    expect(screen.getByRole("heading", { name: "記事 1" })).toBeInTheDocument();
    fireEvent.keyDown(scroller, { key: "ArrowDown" });
    fireEvent.keyDown(scroller, { key: "ArrowDown" });
    fireEvent.keyDown(scroller, { key: "ArrowUp" });
    expect(screen.getByRole("heading", { name: "記事 2" })).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(800);
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  });
  it("retains navigation focus as the next local batch is appended", () => {
    const trigger = start();
    advance(7);
    const next = screen.getByRole("button", { name: "次の記事" });
    next.focus();
    fireEvent.click(next);
    expect(next).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("9 / 20件");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it("aligns the new batch after slides replace an empty queue instead of retaining the end snap target", () => {
    const { rerender } = render(
      <ImmersiveArticleMode
        {...props}
        candidates={[]}
        session={{ remaining: [], served: [articles[0]], paused: true, speed: 1 }}
      />,
    );
    const scroller = screen.getByRole("region", { name: "おすすめ記事を縦にスワイプ" });
    Object.defineProperty(scroller, "clientHeight", { value: 400 });
    let alignedAfterInsertion = false;
    // Model the hosted browser retaining the persistent end-section snap target at its new offset.
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => (scroller.querySelector(".immersive-slide") && !alignedAfterInsertion ? 400 : 0),
      set: (value: number) => {
        if (value === 0 && scroller.querySelector(".immersive-slide")) alignedAfterInsertion = true;
      },
    });
    rerender(
      <ImmersiveArticleMode
        {...props}
        candidates={articles.slice(0, 2)}
        session={{ remaining: [], served: [articles[0]], paused: true, speed: 1 }}
      />,
    );
    fireEvent.scroll(scroller);
    expect(screen.getByRole("heading", { name: "記事 1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 / 1件");
    expect(scroller.scrollTop).toBe(0);
  });
  it.each(["end", "start"])(
    "keeps keyboard focus when the %s navigation control becomes disabled",
    (edge) => {
      const trigger = start();
      advance(edge === "end" ? 22 : 1);
      const button = screen.getByRole("button", {
        name: edge === "end" ? "次の記事" : "前の記事",
      });
      button.focus();
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(screen.getByRole("region", { name: "おすすめ記事を縦にスワイプ" })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    },
  );
  it.each(["再生速度", "一覧に戻る"])(
    "retains the stable %s control focus when native scrolling reaches the end",
    (name) => {
      start();
      advance(22);
      const stable = screen.getByRole(name === "再生速度" ? "combobox" : "button", { name });
      stable.focus();
      const scroller = screen.getByRole("region", { name: "おすすめ記事を縦にスワイプ" });
      Object.defineProperty(scroller, "clientHeight", { value: 400 });
      scroller.scrollTop = 9200;
      fireEvent.scroll(scroller);
      expect(screen.getByRole("status")).toHaveTextContent("ここまで");
      expect(stable).toHaveFocus();
    },
  );
  it.each(["自動再生を再開", "ナレーションを開始", "本文を読む"])(
    "repairs the unavailable %s control focus when native scrolling reaches the end",
    (name) => {
      start();
      advance(22);
      screen.getByRole("button", { name }).focus();
      const scroller = screen.getByRole("region", { name: "おすすめ記事を縦にスワイプ" });
      Object.defineProperty(scroller, "clientHeight", { value: 400 });
      scroller.scrollTop = 9200;
      fireEvent.scroll(scroller);
      expect(scroller).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("ここまで");
    },
  );
  it("saves without reordering, dismisses with a focused undo, and restores the same card", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "後で読む" }));
    expect(screen.getByRole("button", { name: "保存済み" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("heading", { name: "記事 0" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "興味なし" }));
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
    const undo = screen.getByRole("button", { name: "元に戻す" });
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    expect(screen.getByRole("heading", { name: "記事 0" })).toBeInTheDocument();
  });
  it("never displays stale cards when strict source scope, read state or dismissal changes", () => {
    const { rerender } = render(<ImmersiveArticleMode {...props} />);
    rerender(<ImmersiveArticleMode {...props} articles={articles.slice(1)} />);
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
    expect(screen.queryByRole("button", { name: "本文を読む" })).toBeNull();
    rerender(<ImmersiveArticleMode {...props} readIds={new Set(["0"])} />);
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
    rerender(<ImmersiveArticleMode {...props} dismissedIds={new Set(["0"])} />);
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
  });
  it("opens the article only on an explicit full-article action", () => {
    render(<ImmersiveArticleMode {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onSelectArticle).toHaveBeenCalledWith(articles[0]);
  });
  it("traps Tab, exits with Escape, restores focus and can reopen with a fresh session", () => {
    const trigger = start();
    expect(screen.getByRole("button", { name: "一覧に戻る" })).toHaveFocus();
    const next = screen.getByRole("button", { name: "次の記事" });
    next.focus();
    fireEvent.keyDown(next, { key: "Tab" });
    expect(screen.getByRole("button", { name: "一覧に戻る" })).toHaveFocus();
    advance(2);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(getPopupOpenCount()).toBe(0);
    fireEvent.click(trigger);
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
    fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
    expect(trigger).toHaveFocus();
  });
  it("offers an explicit exit for empty candidate pools", () => {
    render(<ImmersiveArticleMode {...props} candidates={[]} />);
    expect(
      screen.getByRole("heading", { name: "いま紹介できる記事はありません" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次の記事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ここで終わる" })).toBeInTheDocument();
  });
  it("enters through recommendations and closes immediately when that scope is disabled", () => {
    const { rerender } = render(<ArticleRecommendations {...props} userId="one" />);
    fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "後で読む" }),
    ).toBeInTheDocument();
    rerender(<ArticleRecommendations {...props} userId="one" enabled={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ArticleRecommendations {...props} userId="one" enabled />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("active-only automatic article requests", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([undefined, "", "http://127.0.0.1/private", "javascript:alert(1)"])(
    "never starts body or OGP for an invalid active URL %s",
    async (link) => {
      vi.useFakeTimers();
      const source = {
        ...articles[0],
        id: "invalid-request-boundary",
        link,
        ogImage: undefined,
      } as Article;
      render(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("an initially hidden active card starts neither body nor OGP until visible", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const source = { ...articles[0], id: "initially-hidden-requests", ogImage: undefined };
    render(
      <VisualModeProvider>
        <ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />
      </VisualModeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetch).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.includes("/api/content?"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("/api/ogp?"))).toHaveLength(1);
  });

  it.each([false, true])(
    "hidden interruption aborts unfinished content and resumes once, including inline-open=%s",
    async (inlineOpen) => {
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      let resolveOld!: (response: Response) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      );
      const source = { ...articles[0], id: `hide-resume-body-${inlineOpen}` };
      render(
        <VisualModeProvider>
          <ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />
        </VisualModeProvider>,
      );
      if (inlineOpen)
        fireEvent.click(screen.getByRole("button", { name: "ここで読む", exact: true }));
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
      visibility.mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        resolveOld(
          new Response(
            JSON.stringify({
              content:
                '<p>obsolete hidden body</p><img src="https://example.com/obsolete.jpg">',
            }),
          ),
        );
      });
      expect(contentLruCache.get(getProviderContentCacheId(source.id, source.link))).toBeNull();
      expect(document.querySelector('img[src*="obsolete.jpg"]')).toBeNull();
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ content: "<p>resumed visible body</p>" })),
      );
      visibility.mockReturnValue("visible");
      fireEvent(document, new Event("visibilitychange"));
      await waitFor(() =>
        expect(contentLruCache.get(getProviderContentCacheId(source.id, source.link))).toContain(
          "resumed visible body",
        ),
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      if (inlineOpen) {
        const reader = screen.getByRole("dialog", { name: "ここで記事の本文を読む" });
        expect(within(reader).getByText("resumed visible body")).toBeInTheDocument();
      }
    },
  );

  it("shares automatic failure with inline reading and retries only on its button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "synthetic unavailable" }), { status: 503 }),
    );
    const source = {
      ...articles[0],
      id: "shared-auto-error",
      content: "<p>complete feed fallback</p>",
    };
    render(<ImmersiveArticleMode {...props} articles={[source]} candidates={[source]} />);
    fireEvent.click(screen.getByRole("button", { name: "ここで読む", exact: true }));
    const reader = screen.getByRole("dialog", { name: "ここで記事の本文を読む" });
    await waitFor(() => expect(within(reader).getByRole("alert")).toBeInTheDocument());
    expect(within(reader).getByText("complete feed fallback")).toBeInTheDocument();
    expect(within(reader).getByText(/全文とは限りません/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ content: "<p>explicit retry succeeded</p>" })),
    );
    fireEvent.click(within(reader).getByRole("button", { name: "全文取得を再試行" }));
    await waitFor(() =>
      expect(within(reader).getByText("explicit retry succeeded")).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(within(reader).getByRole("button", { name: "ショート表示に戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "ここで読む", exact: true }));
    const reopened = screen.getByRole("dialog", { name: "ここで記事の本文を読む" });
    expect(within(reopened).getByText("explicit retry succeeded")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
