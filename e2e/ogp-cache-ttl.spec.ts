import { test, expect } from "@playwright/test";
import {
  computeOgpCacheTtl,
  OGP_CACHE_TTL_SEC,
  OGP_NEGATIVE_CACHE_TTL_SEC,
} from "../src/lib/ogp-cache-ttl";

/**
 * OGP cache TTL 算出純粋関数のテスト (#706 cache poisoning 防御)。
 *
 * Twitter fallback 経路 (`fetchTwitterFallbackImage`) は tweet 内のリンク先 OGP を
 * 抽出するため、攻撃者が任意 image を tweet 経由で全ユーザー shared cache に
 * 30 日間注入可能だった。fallback 経路の TTL を 1 日に短縮して影響範囲を限定する。
 */

test.describe("computeOgpCacheTtl — TTL 選択ロジック", () => {
  test("通常成功 (content あり, fallback なし) → 30 日 TTL", () => {
    const ttl = computeOgpCacheTtl({ hasContent: true, isFallback: false });
    expect(ttl).toBe(OGP_CACHE_TTL_SEC);
    expect(ttl).toBe(30 * 24 * 60 * 60);
  });

  test("Twitter fallback 経路 (content あり, fallback あり) → 1 日 TTL (#706)", () => {
    // 攻撃者が tweet に <img> を含む linked page を投稿しても、
    // 全ユーザーの shared cache 汚染が 1 日で失効する。
    const ttl = computeOgpCacheTtl({ hasContent: true, isFallback: true });
    expect(ttl).toBe(OGP_NEGATIVE_CACHE_TTL_SEC);
    expect(ttl).toBe(24 * 60 * 60);
  });

  test("空応答 (content なし, fallback なし) → 1 日 TTL (negative cache)", () => {
    const ttl = computeOgpCacheTtl({ hasContent: false, isFallback: false });
    expect(ttl).toBe(OGP_NEGATIVE_CACHE_TTL_SEC);
  });

  test("fallback 経路で空応答 (content なし, fallback あり) → 1 日 TTL", () => {
    // 通常起こらないが、fallback 優先の防御的挙動として 1 日を維持。
    const ttl = computeOgpCacheTtl({ hasContent: false, isFallback: true });
    expect(ttl).toBe(OGP_NEGATIVE_CACHE_TTL_SEC);
  });
});

test.describe("computeOgpCacheTtl — 定数", () => {
  test("OGP_CACHE_TTL_SEC は 30 日", () => {
    expect(OGP_CACHE_TTL_SEC).toBe(30 * 24 * 60 * 60);
  });

  test("OGP_NEGATIVE_CACHE_TTL_SEC は 1 日", () => {
    expect(OGP_NEGATIVE_CACHE_TTL_SEC).toBe(24 * 60 * 60);
  });

  test("fallback TTL は通常 TTL より大幅に短い (poisoning 影響範囲を限定)", () => {
    expect(OGP_NEGATIVE_CACHE_TTL_SEC).toBeLessThan(OGP_CACHE_TTL_SEC);
    // 通常 TTL の 1/30 であることを assert (30 倍の差で意図を明示)
    expect(OGP_CACHE_TTL_SEC / OGP_NEGATIVE_CACHE_TTL_SEC).toBe(30);
  });
});
