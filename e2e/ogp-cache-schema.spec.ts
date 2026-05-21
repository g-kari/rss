import { test, expect } from "@playwright/test";
import {
  parseOgpCacheEntry,
  parseOgpCache,
  getOgpImage,
  type OgpCacheEntry,
} from "../src/lib/ogp-cache-schema";

/**
 * #808 Phase 1: OGP cache schema 拡張 + lazy migration 純粋関数 spec。
 *
 * v1 (Record<string, string>) と v2 (Record<string, OgpCacheEntry>) の両形式に対応
 * する parse / serialize ロジックを TDD で網羅。title / description は lazy migration
 * (= 次 fetch で追記) のため、v1 → v2 変換時は image のみで title / description は
 * undefined のまま許容する。
 */

test.describe("parseOgpCacheEntry — v1/v2 両対応 lazy migration", () => {
  test("v1 (string) を v2 object に変換、title/description は undefined", () => {
    const result = parseOgpCacheEntry("https://example.com/og.jpg");
    expect(result).toEqual({ image: "https://example.com/og.jpg" });
  });

  test("v1 空文字 (negative cache) も image='' で保持", () => {
    expect(parseOgpCacheEntry("")).toEqual({ image: "" });
  });

  test("v2 object をそのまま正規化 (全 field)", () => {
    const v2 = {
      image: "https://example.com/og.jpg",
      title: "Title",
      description: "Desc",
      fetchedAt: 1715000000000,
    };
    expect(parseOgpCacheEntry(v2)).toEqual(v2);
  });

  test("v2 object で image のみ持つ場合", () => {
    expect(parseOgpCacheEntry({ image: "x" })).toEqual({ image: "x" });
  });

  test("v2 object で title のみ持つ場合 (description は undefined)", () => {
    expect(parseOgpCacheEntry({ image: "x", title: "T" })).toEqual({
      image: "x",
      title: "T",
    });
  });

  test("v2 object で fetchedAt が非有限値の場合は除外", () => {
    expect(parseOgpCacheEntry({ image: "x", fetchedAt: Infinity })).toEqual({ image: "x" });
    expect(parseOgpCacheEntry({ image: "x", fetchedAt: NaN })).toEqual({ image: "x" });
  });

  test("v2 object で title / description が string でない場合は除外", () => {
    expect(parseOgpCacheEntry({ image: "x", title: 42, description: ["a"] })).toEqual({
      image: "x",
    });
  });

  test("不正値: null は null", () => {
    expect(parseOgpCacheEntry(null)).toBe(null);
  });

  test("不正値: undefined は null", () => {
    expect(parseOgpCacheEntry(undefined)).toBe(null);
  });

  test("不正値: number は null", () => {
    expect(parseOgpCacheEntry(42)).toBe(null);
  });

  test("不正値: array は null", () => {
    expect(parseOgpCacheEntry(["https://x.com/og.jpg"])).toBe(null);
  });

  test("不正値: image が string でない object は null", () => {
    expect(parseOgpCacheEntry({ image: 42 })).toBe(null);
    expect(parseOgpCacheEntry({ image: null })).toBe(null);
  });

  test("不正値: image が無い object は null", () => {
    expect(parseOgpCacheEntry({})).toBe(null);
    expect(parseOgpCacheEntry({ title: "T" })).toBe(null);
  });
});

test.describe("parseOgpCache — Record 一括正規化", () => {
  test("v1 / v2 混在を正規化", () => {
    const result = parseOgpCache({
      "https://a/": "https://a/og.jpg",
      "https://b/": { image: "https://b/og.jpg", title: "B" },
      "https://c/": "",
    });
    expect(result).toEqual({
      "https://a/": { image: "https://a/og.jpg" },
      "https://b/": { image: "https://b/og.jpg", title: "B" },
      "https://c/": { image: "" },
    });
  });

  test("parse 失敗 entry (null / 不正) は結果から除外", () => {
    const result = parseOgpCache({
      "https://a/": "https://a/og.jpg",
      "https://b/": null,
      "https://c/": { title: "no image" }, // image 欠落
      "https://d/": 42,
    });
    expect(result).toEqual({
      "https://a/": { image: "https://a/og.jpg" },
    });
  });

  test("空 Record は {} を返す", () => {
    expect(parseOgpCache({})).toEqual({});
  });

  test("null / 非 object 入力は {} を返す (safe fallback)", () => {
    expect(parseOgpCache(null)).toEqual({});
    expect(parseOgpCache(undefined)).toEqual({});
    expect(parseOgpCache("string")).toEqual({});
    expect(parseOgpCache(42)).toEqual({});
    expect(parseOgpCache(["a"])).toEqual({});
  });
});

test.describe("getOgpImage — v1/v2 compat layer", () => {
  test("v2 OgpCacheEntry から image 取得", () => {
    const entry: OgpCacheEntry = { image: "https://x/og.jpg", title: "T" };
    expect(getOgpImage(entry)).toBe("https://x/og.jpg");
  });

  test("v1 string からそのまま返す", () => {
    expect(getOgpImage("https://x/og.jpg")).toBe("https://x/og.jpg");
  });

  test("空文字 (negative cache) は空文字を返す (null と区別)", () => {
    expect(getOgpImage({ image: "" })).toBe("");
    expect(getOgpImage("")).toBe("");
  });

  test("undefined / null は null を返す", () => {
    expect(getOgpImage(undefined)).toBe(null);
    expect(getOgpImage(null)).toBe(null);
  });
});
