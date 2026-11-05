/**
 * useArticleContent — #836: list/detail サムネ divergence 解消の core 動作を spec で固定。
 *
 * 旧実装は localStorage を同期 read していたため、list view (useOgpCache) が新規取得した
 * OGP image を detail view が観測できず「一覧では出るが詳細では出ない」divergence が発生。
 * 新実装は useOgpCacheContext から cache を共有して以下を担保する:
 *
 * 1. Context cache に entry があれば即 resolvedOgImage に反映 (/api/ogp は呼ばない)
 * 2. cache miss + RSS ogImage なしのとき /api/ogp を fetch し cacheOgpEntry で Context に書き戻す
 * 3. articleLink が空のとき何もしない
 */
import { act, render, renderHook } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../lib/auto-read-debug", () => ({
  autoReadDebug: vi.fn(),
}));

vi.mock("../lib/lru-cache", () => ({
  contentLruCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
  },
}));

import { apiFetch } from "../lib/api-fetch";
import { contentLruCache } from "../lib/lru-cache";
import { OgpCacheProvider, type OgpCacheStore } from "../contexts/OgpCacheContext";
import type { OgpCacheEntry } from "../lib/ogp-cache-schema";
import { useArticleContent } from "./useArticleContent";

const mockApiFetch = vi.mocked(apiFetch);

function makeStore(initial: Record<string, OgpCacheEntry> = {}): {
  store: OgpCacheStore;
  cacheCalls: Array<{ url: string; partial: Partial<OgpCacheEntry> }>;
} {
  const cache: Record<string, OgpCacheEntry> = { ...initial };
  const cacheCalls: Array<{ url: string; partial: Partial<OgpCacheEntry> }> = [];
  const store: OgpCacheStore = {
    ogpCache: Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, v.image])),
    getEntry: (url) => cache[url],
    cacheOgpEntry: (url, partial) => {
      cacheCalls.push({ url, partial });
      const prev = cache[url];
      cache[url] = {
        image: partial.image ?? prev?.image ?? "",
        ...(partial.title !== undefined ? { title: partial.title } : {}),
      };
    },
  };
  return { store, cacheCalls };
}

function wrapWith(store: OgpCacheStore) {
  return ({ children }: { children: ReactNode }) => (
    <OgpCacheProvider value={store}>{children}</OgpCacheProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useArticleContent — OGP cache resolution (#836)", () => {
  it("Context cache に entry があれば resolvedOgImage に即セットし /api/ogp を呼ばない", () => {
    const link = "https://example.com/article-1";
    const cachedImage = "https://cdn.example.com/main.jpg";
    const { store } = makeStore({ [link]: { image: cachedImage } });

    const { result } = renderHook(() => useArticleContent("a1", link, undefined), {
      wrapper: wrapWith(store),
    });

    expect(result.current.resolvedOgImage).toBe(cachedImage);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("cache miss + article.ogImage あり → /api/ogp 呼ばず resolvedOgImage は null のまま (RSS image 優先 fallback)", () => {
    const link = "https://example.com/article-2";
    const { store } = makeStore();

    const { result } = renderHook(
      () => useArticleContent("a2", link, "https://feed.example.com/tiny.jpg"),
      { wrapper: wrapWith(store) },
    );

    expect(result.current.resolvedOgImage).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("cache miss + article.ogImage なし → /api/ogp fetch し cacheOgpEntry で Context に書き戻す", async () => {
    const link = "https://example.com/article-3";
    const fetchedImage = "https://cdn.example.com/fetched.jpg";
    const { store, cacheCalls } = makeStore();

    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ image: fetchedImage }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useArticleContent("a3", link, undefined), {
      wrapper: wrapWith(store),
    });

    expect(result.current.resolvedOgImage).toBeNull();

    // stagger 遅延 (≤ 1500ms) を進めた後、apiFetch の resolved promise を microtask で drain。
    // fakeTimers モードでは waitFor が retry できないため、明示的に Promise.resolve を数回
    // await して .then() chain (apiFetch → .json() → cacheOgpEntry) を順次解決させる。
    await act(async () => {
      vi.advanceTimersByTime(2000);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0]?.[0]).toContain(encodeURIComponent(link));
    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0]).toEqual({ url: link, partial: { image: fetchedImage } });
  });

  it("articleLink が undefined のとき /api/ogp を呼ばず Context にも書き戻さない", async () => {
    const { store, cacheCalls } = makeStore();

    const { result } = renderHook(() => useArticleContent("a4", undefined, undefined), {
      wrapper: wrapWith(store),
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.resolvedOgImage).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(cacheCalls).toHaveLength(0);
  });

  it("Context cache が後から更新されたら resolvedOgImage が反映される (divergence 解消の core 機構)", () => {
    // list view が後から /api/ogp fetch 成功で Context cache に書き込むシナリオ。
    // detail view の useEffect が getEntry の identity 変化を検知して再評価され、
    // cache hit branch で resolvedOgImage が更新されることを assert する。
    const link = "https://example.com/article-5";
    const newImage = "https://cdn.example.com/list-fetched.jpg";
    let currentStore = makeStore().store;

    const wrapper = ({ children }: { children: ReactNode }) => (
      <OgpCacheProvider value={currentStore}>{children}</OgpCacheProvider>
    );

    const { result, rerender } = renderHook(
      () => useArticleContent("a5", link, "https://feed.example.com/tiny.jpg"),
      { wrapper },
    );

    // 初期状態: cache miss + article.ogImage あり → fetch skip、resolvedOgImage は null
    expect(result.current.resolvedOgImage).toBeNull();

    // list view が後から cache に entry を追加 (例: useOgpCache が /api/ogp 完了で setOgpCacheV2)
    currentStore = makeStore({ [link]: { image: newImage } }).store;
    act(() => {
      rerender();
    });

    // detail view の useEffect が新 getEntry の identity 変化で再評価 → cache hit で更新
    expect(result.current.resolvedOgImage).toBe(newImage);
  });

  it("getEntry identity が stable でも ogpCache 値変化で resolvedOgImage が反映される (#1088 Finding 1)", () => {
    // 本番の useOgpCache は getEntry / cacheOgpEntry を useCallback([]) + useSyncedRef で
    // identity 永続 stable に保つ。前テストは rerender 毎に getEntry を作り直すため本番挙動を
    // 再現できていなかった (effect deps の getEntry 変化で再発火 = 偽の cross-view repair)。
    // 本テストは stable な関数参照を共有して「ogpCache[link] の値変化」のみで再評価されるかを
    // assert する (= 真の cross-view repair)。
    const link = "https://example.com/article-6";
    const newImage = "https://cdn.example.com/list-fetched-6.jpg";
    const backing: Record<string, OgpCacheEntry> = {};
    const stableGetEntry = (url: string) => backing[url];
    const stableCacheOgpEntry = () => {};
    const makeRealStore = (): OgpCacheStore => ({
      ogpCache: Object.fromEntries(Object.entries(backing).map(([k, v]) => [k, v.image])),
      getEntry: stableGetEntry, // ← identity 永続 stable (本番再現)
      cacheOgpEntry: stableCacheOgpEntry, // ← identity 永続 stable
    });

    let currentStore = makeRealStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <OgpCacheProvider value={currentStore}>{children}</OgpCacheProvider>
    );

    const { result, rerender } = renderHook(
      () => useArticleContent("a6", link, "https://feed.example.com/tiny.jpg"),
      { wrapper },
    );
    expect(result.current.resolvedOgImage).toBeNull();

    // list view が cache に書き込む (backing 更新) → 新 store (ogpCache 値は変化、getEntry は stable)
    backing[link] = { image: newImage };
    currentStore = makeRealStore();
    act(() => {
      rerender();
    });

    // getEntry identity は不変だが ogpCache[link] 値変化で effect 再発火 → cache hit で更新
    expect(result.current.resolvedOgImage).toBe(newImage);
  });
});

describe("useArticleContent — 記事切替後の fetchError leak 防止 (#abort-guard sibling, #1115 と同型)", () => {
  it("再試行不能エラー後の記事切替で再試行状態を初期化する", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "記事が見つかりません" }), { status: 404 }),
    );
    const { store } = makeStore();
    const wrapper = wrapWith(store);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useArticleContent(id, "https://a.example.com/article", ""),
      { initialProps: { id: "article-A" }, wrapper },
    );

    await act(async () => {
      await result.current.fetchFullContent();
    });
    expect(result.current.fetchRetryable).toBe(false);

    act(() => {
      rerender({ id: "article-B" });
    });
    expect(result.current.fetchRetryable).toBe(true);
  });

  it("記事 ID が同じでも URL 更新時に前 URL のエラー状態を初期化する", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "記事が見つかりません" }), { status: 404 }),
    );
    const { store } = makeStore();
    const wrapper = wrapWith(store);

    const { result, rerender } = renderHook(
      ({ link }: { link: string }) => useArticleContent("article-A", link, ""),
      { initialProps: { link: "https://a.example.com/article" }, wrapper },
    );
    await act(async () => {
      await result.current.fetchFullContent();
    });
    expect(result.current.fetchRetryable).toBe(false);

    act(() => {
      rerender({ link: "https://b.example.com/article" });
    });
    expect(result.current.fetchError).toBe("");
    expect(result.current.fetchRetryable).toBe(true);
  });

  it("記事 ID が同じでも URL 更新時に前 URL の本文を表示しない", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ content: "旧 URL の本文" }), { status: 200 }),
    );
    const { store } = makeStore();
    const wrapper = wrapWith(store);
    const { result, rerender } = renderHook(
      ({ link }: { link: string }) => useArticleContent("article-A", link, ""),
      { initialProps: { link: "https://a.example.com/article" }, wrapper },
    );

    await act(async () => {
      await result.current.fetchFullContent();
    });
    expect(result.current.storedContent).toBe("旧 URL の本文");

    act(() => {
      rerender({ link: "https://b.example.com/article" });
    });
    expect(result.current.storedContent).toBeNull();
  });

  it("記事 ID が同じでも URL 更新後に旧 URL の fetch error を反映しない", async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    mockApiFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { store } = makeStore();
    const wrapper = wrapWith(store);
    const { result, rerender } = renderHook(
      ({ link }: { link: string }) => useArticleContent("article-A", link, ""),
      { initialProps: { link: "https://a.example.com/article" }, wrapper },
    );

    act(() => {
      void result.current.fetchFullContent();
    });
    act(() => {
      rerender({ link: "https://b.example.com/article" });
    });

    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ error: "旧 URL の失敗" }), { status: 500 }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.fetchError).toBe("");
  });

  it("記事切替 (abort) 後に旧記事の fetch error が新記事に leak しない", async () => {
    // apiFetch を手動 resolve できる deferred promise にする
    let resolveFetch: ((res: Response) => void) | null = null;
    mockApiFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { store } = makeStore();
    const wrapper = wrapWith(store);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useArticleContent(id, "https://a.example.com/article", ""),
      { initialProps: { id: "article-A" }, wrapper },
    );

    // 記事 A の全文取得を開始 (apiFetch は deferred で pending)
    act(() => {
      void result.current.fetchFullContent();
    });
    expect(result.current.fetching).toBe(true);

    // 記事 B へ切替 → articleId effect が controller A を abort + fetchError クリア
    act(() => {
      rerender({ id: "article-B" });
    });
    expect(result.current.fetchError).toBe("");

    // 旧記事 A の fetch が遅れて 500 エラーで resolve (abort 後)
    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ error: "A の取得失敗" }), { status: 500 }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // abort recheck により旧記事の error は新記事に leak しない
    expect(result.current.fetchError).toBe("");
  });
});

describe("useArticleContent request suspension", () => {
  it("blocks content and OGP while suspended and resolves OGP after resuming", async () => {
    mockApiFetch.mockImplementation(async () => new Response("{}"));
    const { store } = makeStore();
    const { result, rerender } = renderHook(
      ({ allowed }) =>
        useArticleContent("suspended", "https://example.com/suspended", undefined, allowed),
      { initialProps: { allowed: false }, wrapper: wrapWith(store) },
    );
    await act(async () => {
      await result.current.fetchFullContentOnce();
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    rerender({ allowed: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toContain("/api/ogp?");
  });

  it("saved callbacks cannot start hidden/stale requests or abort newer work", async () => {
    const pending = new Promise<Response>(() => {});
    mockApiFetch.mockReturnValue(pending);
    const { store } = makeStore();
    const { result, rerender } = renderHook(
      ({ id, allowed }) =>
        useArticleContent(id, `https://example.com/${id}`, "supplied.jpg", allowed),
      { initialProps: { id: "old", allowed: true }, wrapper: wrapWith(store) },
    );
    const oldFetch = result.current.fetchFullContent;
    rerender({ id: "old", allowed: false });
    await act(async () => {
      await oldFetch();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    rerender({ id: "new", allowed: true });
    act(() => {
      void result.current.fetchFullContentOnce();
    });
    const signal = mockApiFetch.mock.calls[0][1]?.signal;
    await act(async () => {
      await oldFetch();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
  });

  it("aborts hidden body JSON and accepts one resumed request", async () => {
    let resolveJson!: (value: { content: string }) => void;
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    } as Response);
    const { store } = makeStore();
    const { result, rerender } = renderHook(
      ({ allowed }) =>
        useArticleContent(
          "body-hidden",
          "https://example.com/body-hidden",
          "supplied.jpg",
          allowed,
        ),
      { initialProps: { allowed: true }, wrapper: wrapWith(store) },
    );
    act(() => {
      void result.current.fetchFullContentOnce();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const oldSignal = mockApiFetch.mock.calls[0][1]?.signal;
    rerender({ allowed: false });
    expect(oldSignal?.aborted).toBe(true);
    expect(result.current.fetching).toBe(false);
    await act(async () => {
      resolveJson({ content: "hidden obsolete body" });
      await Promise.resolve();
    });
    expect(result.current.storedContent).toBeNull();
    expect(contentLruCache.set).not.toHaveBeenCalledWith(expect.anything(), "hidden obsolete body");
    mockApiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ content: "resumed body" })));
    rerender({ allowed: true });
    await act(async () => {
      await result.current.fetchFullContentOnce();
    });
    expect(result.current.storedContent).toBe("resumed body");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects late hidden OGP and resolves it on resume", async () => {
    let resolveJson!: (value: { image: string }) => void;
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    } as Response);
    const { store, cacheCalls } = makeStore();
    const { result, rerender } = renderHook(
      ({ allowed }) =>
        useArticleContent("ogp-hidden", "https://example.com/ogp-hidden", undefined, allowed),
      { initialProps: { allowed: true }, wrapper: wrapWith(store) },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const oldSignal = mockApiFetch.mock.calls[0][1]?.signal;
    rerender({ allowed: false });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      resolveJson({ image: "https://example.com/stale.jpg" });
      await Promise.resolve();
    });
    expect(result.current.resolvedOgImage).toBeNull();
    expect(cacheCalls).toEqual([]);
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ image: "https://example.com/current.jpg" })),
    );
    rerender({ allowed: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.resolvedOgImage).toBe("https://example.com/current.jpg");
    expect(cacheCalls).toEqual([
      {
        url: "https://example.com/ogp-hidden",
        partial: { image: "https://example.com/current.jpg" },
      },
    ]);
  });
});

it("a saved body callback cannot start a request after its reader unmounts", async () => {
  const { store } = makeStore();
  const { result, unmount } = renderHook(
    () => useArticleContent("closed-reader", "https://example.com/closed-reader", "supplied.jpg"),
    { wrapper: wrapWith(store) },
  );
  const fetchAfterClose = result.current.fetchFullContent;
  unmount();
  await act(async () => {
    await fetchAfterClose();
  });
  expect(mockApiFetch).not.toHaveBeenCalled();
});

it("StrictMode child-first replay keeps one request across same-turn cleanup", async () => {
  let resolveFetch!: (response: Response) => void;
  mockApiFetch.mockReturnValue(
    new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );
  const latest: { value?: ReturnType<typeof useArticleContent> } = {};
  function ChildIntent({ fetchOnce }: { fetchOnce: () => Promise<void> }) {
    useEffect(() => {
      void fetchOnce();
    }, [fetchOnce]);
    return null;
  }
  function Owner() {
    const content = useArticleContent(
      "strict-replay",
      "https://example.com/strict-replay",
      "supplied.jpg",
    );
    latest.value = content;
    return <ChildIntent fetchOnce={content.fetchFullContentOnce} />;
  }
  const { store } = makeStore();
  const Wrapper = wrapWith(store);
  render(
    <StrictMode>
      <Wrapper>
        <Owner />
      </Wrapper>
    </StrictMode>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
  expect(mockApiFetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  await act(async () => {
    resolveFetch(new Response(JSON.stringify({ content: "strict replay body" })));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(latest.value?.storedContent).toBe("strict replay body");
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
});

it.each(["id", "link", "unmount"])(
  "discarding %s while body JSON is pending cannot populate the old cache",
  async (transition) => {
    let resolveJson!: (value: { content: string }) => void;
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    } as Response);
    const { store } = makeStore();
    const { result, rerender, unmount } = renderHook(
      ({ id, link }) => useArticleContent(id, link, "supplied.jpg"),
      {
        initialProps: { id: "old-json", link: "https://example.com/old-json" },
        wrapper: wrapWith(store),
      },
    );
    act(() => {
      void result.current.fetchFullContentOnce();
    });
    await act(async () => {
      await Promise.resolve();
    });
    if (transition === "unmount") unmount();
    else
      rerender({
        id: transition === "id" ? "new-json" : "old-json",
        link:
          transition === "link" ? "https://example.com/new-json" : "https://example.com/old-json",
      });
    const obsolete = `obsolete body after ${transition}`;
    await act(async () => {
      resolveJson({ content: obsolete });
      await Promise.resolve();
    });
    expect(contentLruCache.set).not.toHaveBeenCalledWith(expect.anything(), obsolete);
    if (transition !== "unmount") expect(result.current.storedContent).toBeNull();
  },
);

it.each(["id", "link", "unmount"])(
  "discarding %s while OGP JSON is pending cannot populate the old cache",
  async (transition) => {
    let resolveJson!: (value: { image: string }) => void;
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    } as Response);
    const { store, cacheCalls } = makeStore();
    const { result, rerender, unmount } = renderHook(
      ({ id, link }) => useArticleContent(id, link, undefined),
      {
        initialProps: { id: "old-ogp-json", link: "https://example.com/old-ogp-json" },
        wrapper: wrapWith(store),
      },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    if (transition === "unmount") unmount();
    else
      rerender({
        id: transition === "id" ? "new-ogp-json" : "old-ogp-json",
        link:
          transition === "link"
            ? "https://example.com/new-ogp-json"
            : "https://example.com/old-ogp-json",
      });
    await act(async () => {
      resolveJson({ image: "https://example.com/obsolete-ogp.jpg" });
      await Promise.resolve();
    });
    expect(cacheCalls).toEqual([]);
    if (transition !== "unmount") expect(result.current.resolvedOgImage).toBeNull();
  },
);
