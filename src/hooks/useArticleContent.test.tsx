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
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
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
