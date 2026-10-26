import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api-fetch";
import { contentLruCache } from "../lib/lru-cache";
import { useArticleContent } from "./useArticleContent";
import { OgpCacheProvider } from "../contexts/OgpCacheContext";
import { useFullContentIntent } from "./useFullContentIntent";
import { autoReadDebug } from "../lib/auto-read-debug";
import AutoReadController from "../components/article-view/AutoReadController";
import { makeArticle } from "../../e2e/helpers/article";
import type { Article } from "../types";
import { devError } from "../lib/dev-log";
vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("../lib/lru-cache", () => ({ contentLruCache: { get: vi.fn(() => null), set: vi.fn() } }));
vi.mock("../lib/auto-read-debug", () => ({ autoReadDebug: vi.fn() }));
vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ info: vi.fn() }) }));
const cacheOgpEntry = vi.fn();
const store = { ogpCache: {}, getEntry: () => undefined, cacheOgpEntry };
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <OgpCacheProvider value={store}>{children}</OgpCacheProvider>
  </StrictMode>
);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useArticleContent request lifetime", () => {
  it.each([false, true])(
    "ignores old OGP JSON decoded after navigation (same ID: %s)",
    async (sameId) => {
      const oldJson = deferred<{ image: string }>();
      vi.mocked(apiFetch)
        .mockResolvedValueOnce({ ok: true, json: () => oldJson.promise } as Response)
        .mockResolvedValueOnce(Response.json({ image: "https://images.test/b.jpg" }));
      const view = renderHook(({ id, link }) => useArticleContent(id, link, undefined), {
        wrapper,
        reactStrictMode: true,
        initialProps: { id: "a", link: "https://example.test/a" },
      });
      await tick();
      view.rerender({ id: sameId ? "a" : "b", link: "https://example.test/b" });
      await tick();
      expect(view.result.current.resolvedOgImage).toBe("https://images.test/b.jpg");
      await act(async () => {
        oldJson.resolve({ image: "https://images.test/a.jpg" });
      });
      expect(view.result.current.resolvedOgImage).toBe("https://images.test/b.jpg");
      expect(cacheOgpEntry).toHaveBeenCalledExactlyOnceWith("https://example.test/b", {
        image: "https://images.test/b.jpg",
      });
    },
  );
  it("does not publish or cache an OGP JSON result after unmount", async () => {
    const oldJson = deferred<{ image: string }>();
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: () => oldJson.promise } as Response);
    const view = renderHook(() => useArticleContent("a", "https://example.test/a", undefined), {
      wrapper,
      reactStrictMode: true,
    });
    await tick();
    view.unmount();
    await act(async () => {
      oldJson.resolve({ image: "https://images.test/a.jpg" });
    });
    expect(cacheOgpEntry).not.toHaveBeenCalled();
  });
  it("does not decode an OGP response whose headers arrive after navigation", async () => {
    const oldHeaders = deferred<Response>();
    const json = vi.fn().mockResolvedValue({ image: "https://images.test/a.jpg" });
    vi.mocked(apiFetch)
      .mockReturnValueOnce(oldHeaders.promise)
      .mockResolvedValueOnce(Response.json({ image: "https://images.test/b.jpg" }));
    const view = renderHook(
      ({ id }) => useArticleContent(id, `https://example.test/${id}`, undefined),
      { wrapper, reactStrictMode: true, initialProps: { id: "a" } },
    );
    await tick();
    view.rerender({ id: "b" });
    await tick();
    await act(async () => {
      oldHeaders.resolve({ ok: true, json } as unknown as Response);
    });
    expect(json).not.toHaveBeenCalled();
    expect(view.result.current.resolvedOgImage).toBe("https://images.test/b.jpg");
  });
  it("leaves active OGP JSON errors observable but ignores an obsolete rejection", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError("active synthetic")),
    } as unknown as Response);
    const oldJson = deferred<{ image: string }>();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: () => oldJson.promise,
    } as Response);
    const view = renderHook(
      ({ id }) => useArticleContent(id, `https://example.test/${id}`, undefined),
      { wrapper, reactStrictMode: true, initialProps: { id: "active" } },
    );
    await tick();
    expect(devError).toHaveBeenCalledOnce();
    view.rerender({ id: "obsolete" });
    await tick();
    view.unmount();
    await act(async () => {
      oldJson.reject(new SyntaxError("obsolete synthetic"));
    });
    expect(devError).toHaveBeenCalledOnce();
    expect(cacheOgpEntry).not.toHaveBeenCalled();
  });
  it.each([new TypeError("synthetic network"), new SyntaxError("synthetic JSON")])(
    "does not leak an obsolete content rejection into the new reader: %s",
    async (error) => {
      const oldJson = deferred<{ content: string }>();
      vi.mocked(apiFetch).mockResolvedValueOnce({
        ok: true,
        json: () => oldJson.promise,
      } as Response);
      const view = renderHook(
        ({ id, link }) => useArticleContent(id, link, "https://images.test/cover.jpg"),
        {
          wrapper,
          reactStrictMode: true,
          initialProps: { id: "a", link: "https://example.test/a" },
        },
      );
      let pending!: Promise<void>;
      act(() => {
        pending = view.result.current.fetchFullContent();
      });
      await act(async () => {
        await Promise.resolve();
      });
      view.rerender({ id: "b", link: "https://example.test/b" });
      await act(async () => {
        oldJson.reject(error);
        await pending;
      });
      expect(view.result.current.fetchError).toBe("");
      expect(view.result.current.fetching).toBe(false);
      expect(view.result.current.storedContent).toBeNull();
      expect(contentLruCache.set).not.toHaveBeenCalled();
    },
  );
  it.each([new TypeError("active network"), new SyntaxError("active JSON")])(
    "still shows a current content request failure: %s",
    async (error) => {
      vi.mocked(apiFetch).mockRejectedValue(error);
      const view = renderHook(
        () => useArticleContent("a", "https://example.test/a", "https://images.test/cover.jpg"),
        { wrapper, reactStrictMode: true },
      );
      await act(async () => {
        await view.result.current.fetchFullContent();
      });
      expect(view.result.current.fetchError).toBe(
        "ネットワークエラーが発生しました。接続を確認してください。",
      );
      expect(view.result.current.fetchRetryable).toBe(true);
      expect(view.result.current.fetching).toBe(false);
      expect(apiFetch).toHaveBeenCalledOnce();
    },
  );
  it("a superseded request on the same article cannot overwrite a successful newer request", async () => {
    const oldJson = deferred<{ content: string }>();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ ok: true, json: () => oldJson.promise } as Response)
      .mockResolvedValueOnce(Response.json({ content: "Current content" }));
    const view = renderHook(
      () => useArticleContent("a", "https://example.test/a", "https://images.test/cover.jpg"),
      { wrapper, reactStrictMode: true },
    );
    let pending!: Promise<void>;
    act(() => {
      pending = view.result.current.fetchFullContent();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await view.result.current.fetchFullContent();
    });
    await act(async () => {
      oldJson.reject(new SyntaxError("obsolete synthetic"));
      await pending;
    });
    expect(view.result.current.storedContent).toBe("Current content");
    expect(view.result.current.fetchError).toBe("");
    expect(view.result.current.fetching).toBe(false);
    expect(contentLruCache.set).toHaveBeenCalledExactlyOnceWith("a", "Current content");
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
  it("aborts in-flight content and suppresses its late callback after unmount", async () => {
    const json = deferred<{ content: string }>();
    const onFetched = vi.fn();
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true, json: () => json.promise } as Response);
    const view = renderHook(() => useArticleContent("a", "https://example.test/a", "cover"), {
      wrapper,
      reactStrictMode: true,
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = view.result.current.fetchFullContent(onFetched);
      await Promise.resolve();
    });
    const signal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
    view.unmount();
    await act(async () => {
      json.resolve({ content: "too late" });
      await pending;
    });
    expect({
      aborted: signal?.aborted,
      cacheWrites: vi.mocked(contentLruCache.set).mock.calls.length,
      callbacks: onFetched.mock.calls.length,
    }).toEqual({ aborted: true, cacheWrites: 0, callbacks: 0 });
  });
  it.each([new TypeError("unmounted network"), new SyntaxError("unmounted JSON")])(
    "aborts late content failure after unmount: %s",
    async (error) => {
      const json = deferred<{ content: string }>();
      const onFetched = vi.fn();
      vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true, json: () => json.promise } as Response);
      const view = renderHook(() => useArticleContent("a", "https://example.test/a", "cover"), {
        wrapper,
        reactStrictMode: true,
      });
      let pending!: Promise<void>;
      await act(async () => {
        pending = view.result.current.fetchFullContent(onFetched);
        await Promise.resolve();
      });
      const signal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
      view.unmount();
      await act(async () => {
        json.reject(error);
        await pending;
      });
      expect(signal?.aborted).toBe(true);
      expect(
        vi
          .mocked(autoReadDebug)
          .mock.calls.some(([event]) => event === "useArticleContent.fetch-network-error"),
      ).toBe(false);
      expect(contentLruCache.set).not.toHaveBeenCalled();
      expect(onFetched).not.toHaveBeenCalled();
    },
  );

  it("completes a consumed one-shot full-content intent under StrictMode effect replay", async () => {
    const response = deferred<Response>();
    const consume = vi.fn(() => true);
    let effectSetups = 0;
    const article = { id: "a", link: "https://example.test/a" } as Article;
    const intent = { requestId: 1, articleId: "a", link: article.link, target: "pane" as const };
    vi.mocked(apiFetch).mockReturnValueOnce(response.promise);
    const view = renderHook(
      () => {
        const content = useArticleContent(article.id, article.link, "cover");
        useFullContentIntent(
          article,
          intent,
          "pane",
          !!content.storedContent,
          true,
          content.fetching,
          content.fetchFullContentOnce,
          consume,
        );
        useEffect(() => {
          effectSetups++;
        }, []);
        return content;
      },
      { wrapper, reactStrictMode: true },
    );
    await act(async () => {
      response.resolve(Response.json({ content: "one-shot text" }));
    });
    expect(effectSetups).toBe(2);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(view.result.current.storedContent).toBe("one-shot text");
    expect(view.result.current.fetchError).toBe("");
    expect(view.result.current.fetching).toBe(false);
  });
  it("keeps the actual AutoReadController's current child-started request alive across StrictMode and navigation", async () => {
    const requests: Array<{
      url: string;
      signal: AbortSignal | null | undefined;
      response: ReturnType<typeof deferred<Response>>;
    }> = [];
    vi.mocked(apiFetch).mockImplementation((url, options) => {
      const response = deferred<Response>();
      requests.push({ url: String(url), signal: options?.signal, response });
      return response.promise;
    });
    const onSpeak = vi.fn();
    let effectSetups = 0;
    const a = makeArticle({ id: "a", link: "https://example.test/a", ogImage: "cover" });
    const b = makeArticle({ id: "b", link: "https://example.test/b", ogImage: "cover" });
    function Harness({ article }: { article: Article }) {
      const content = useArticleContent(article.id, article.link, article.ogImage);
      useEffect(() => {
        effectSetups++;
      }, []);
      return (
        <>
          <AutoReadController
            enabled
            article={article}
            ttsSupported
            ttsPlaying={false}
            ttsPaused={false}
            ttsEndedCount={0}
            fetching={content.fetching}
            fetchError={content.fetchError}
            hasFullContent={!!content.storedContent}
            canFetch={!content.storedContent}
            ttsText={content.storedContent ?? ""}
            onSpeak={onSpeak}
            onTtsStop={() => {}}
            onFetch={content.fetchFullContent}
            hasNext={false}
            onAutoModeStop={() => {}}
          />
          <output aria-label="review content">{content.storedContent}</output>
          <output aria-label="review loading">{String(content.fetching)}</output>
          <output aria-label="review error">{content.fetchError}</output>
        </>
      );
    }
    const tree = (article: Article) => (
      <StrictMode>
        <OgpCacheProvider value={store}>
          <Harness article={article} />
        </OgpCacheProvider>
      </StrictMode>
    );
    const view = render(tree(a));
    await act(async () => {
      await Promise.resolve();
    });
    expect(effectSetups).toBe(2);
    expect(
      requests.some(
        (request) => request.url.includes(encodeURIComponent(a.link)) && !request.signal?.aborted,
      ),
    ).toBe(true);
    view.rerender(tree(b));
    await act(async () => {
      await Promise.resolve();
    });
    const current = [...requests]
      .reverse()
      .find((request) => request.url.includes(encodeURIComponent(b.link)))!;
    expect(current.signal?.aborted).toBe(false);
    expect(screen.getByLabelText("review loading")).toHaveTextContent("true");
    await act(async () => {
      requests
        .filter((request) => request !== current)
        .forEach((request) => request.response.resolve(Response.json({ content: "obsolete A" })));
      current.response.resolve(Response.json({ content: "current B" }));
    });
    expect(screen.getByLabelText("review content")).toHaveTextContent("current B");
    expect(screen.getByLabelText("review error")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("review loading")).toHaveTextContent("false");
    expect(contentLruCache.set).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledExactlyOnceWith("current B");
  });
});
