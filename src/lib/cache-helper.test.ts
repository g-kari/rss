import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  matchCfCache,
  cachePut,
  cachePutAsync,
  deleteCfCache,
  purgeFeedsCache,
  purgeArticlesCache,
  buildCacheKey,
} from "./cache-helper";

/**
 * `cache-helper.ts` の Cache API 未提供環境ガード spec。
 *
 * `next dev` (miniflare local) では `caches` global 自体が未定義で、素で
 * `caches.default` を参照すると `ReferenceError: caches is not defined` が投げられ、
 * `withSession` が unhandled error として拾って Route Handler が 500 を返していた
 * (`/api/feeds` / `/api/articles` / `/api/content` / `/api/ogp` 等が dev で全滅)。
 *
 * 本 spec は「`caches` 未定義でも throw せず cache bypass として振る舞う」ことを固定する。
 * 本番 Workers runtime では `caches.default` が常に定義済のため、通常経路 (cache あり)
 * が従来どおり動作することも併せて assert する。
 */

/** `ctx.waitUntil` を同期実行する最小 ExecutionContext スタブ。 */
function makeCtx(): { ctx: ExecutionContext; waited: Promise<unknown>[] } {
  const waited: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      waited.push(p);
    },
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, waited };
}

const ORIGIN = "https://rss.0g0.xyz";

describe("cache-helper — caches 未定義環境 (dev) のガード", () => {
  beforeEach(() => {
    vi.stubGlobal("caches", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matchCfCache は throw せず null (MISS 扱い) を返す", async () => {
    const key = await buildCacheKey(ORIGIN, "articles", "user:u1:feed:all:page:1");
    await expect(matchCfCache(key)).resolves.toBeNull();
  });

  it("cachePut は throw せず no-op で完了する", async () => {
    const key = await buildCacheKey(ORIGIN, "ogp", "https://example.com/a");
    await expect(cachePut(key, new Response("{}"))).resolves.toBeUndefined();
  });

  it("cachePutAsync は throw せず waitUntil も呼ばない", async () => {
    const key = await buildCacheKey(ORIGIN, "feeds", "user:u1");
    const { ctx, waited } = makeCtx();
    expect(() => cachePutAsync(key, new Response("{}"), ctx, "feeds-list")).not.toThrow();
    expect(waited).toHaveLength(0);
  });

  it("deleteCfCache は throw せず false を返す", async () => {
    const key = await buildCacheKey(ORIGIN, "feeds", "user:u1");
    await expect(deleteCfCache(key)).resolves.toBe(false);
  });

  it("purgeFeedsCache / purgeArticlesCache は throw せず waitUntil も呼ばない", async () => {
    const { ctx, waited } = makeCtx();
    await expect(purgeFeedsCache(ORIGIN, "u1", ctx)).resolves.toBeUndefined();
    await expect(purgeArticlesCache(ORIGIN, "u1", ctx)).resolves.toBeUndefined();
    expect(waited).toHaveLength(0);
  });
});

describe("cache-helper — caches 提供環境 (本番 Workers) の通常経路", () => {
  let match: ReturnType<typeof vi.fn>;
  let put: ReturnType<typeof vi.fn>;
  let del: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    match = vi.fn(async () => undefined);
    put = vi.fn(async () => undefined);
    del = vi.fn(async () => true);
    vi.stubGlobal("caches", { default: { match, put, delete: del } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matchCfCache は HIT 時に Response を、MISS 時に null を返す", async () => {
    const key = await buildCacheKey(ORIGIN, "articles", "user:u1:feed:all:page:1");

    await expect(matchCfCache(key)).resolves.toBeNull();
    expect(match).toHaveBeenCalledWith(key);

    const hit = new Response("{}");
    match.mockResolvedValueOnce(hit);
    await expect(matchCfCache(key)).resolves.toBe(hit);
  });

  it("cachePut / cachePutAsync は caches.default.put に委譲する", async () => {
    const key = await buildCacheKey(ORIGIN, "ogp", "https://example.com/a");
    const res = new Response("{}");

    await cachePut(key, res);
    expect(put).toHaveBeenCalledWith(key, res);

    const { ctx, waited } = makeCtx();
    cachePutAsync(key, res, ctx, "ogp");
    expect(waited).toHaveLength(1);
    await Promise.all(waited);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("deleteCfCache は caches.default.delete の結果を返す", async () => {
    const key = await buildCacheKey(ORIGIN, "feeds", "user:u1");
    await expect(deleteCfCache(key)).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith(key);
  });

  it("purgeFeedsCache / purgeArticlesCache は waitUntil 経由で delete する", async () => {
    const { ctx, waited } = makeCtx();
    await purgeFeedsCache(ORIGIN, "u1", ctx);
    await purgeArticlesCache(ORIGIN, "u1", ctx);
    expect(waited).toHaveLength(2);
    await Promise.all(waited);
    expect(del).toHaveBeenCalledTimes(2);
  });
});
