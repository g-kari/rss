import { test, expect } from "@playwright/test";
import { explodeArticlesIntoGalleryEntries, type GalleryEntry } from "../src/lib/gallery-explode";
import type { Article } from "../src/types";

/**
 * `explodeArticlesIntoGalleryEntries` の単体テスト (画像/動画 view で 1 記事 N 画像を
 * N 個のカードに分解する純粋関数、Phase 0b)。
 *
 * 設計:
 * - explode=false → 1 article 1 entry (従来挙動の維持)
 * - explode=true + prefetched 完了 + N 画像 → N entry に展開 (本文出現順)
 * - explode=true + prefetched 未完了 (undefined) → 1 entry (placeholder/thumb fallback)
 * - explode=true + prefetched 空配列 → 1 entry (本文画像なし、thumb fallback)
 * - 記事順序は維持、同一記事内は imageIndex 昇順
 * - key は masonic item key として unique 必須
 */

function makeArticle(id: string, title = `title-${id}`): Article {
  return {
    id,
    feedHash: "feed-hash-1",
    guid: `guid-${id}`,
    title,
    link: `https://example.com/${id}`,
    summary: "",
    publishedAt: "2026-05-12T00:00:00Z",
    createdAt: "2026-05-12T00:00:00Z",
  };
}

test.describe("explodeArticlesIntoGalleryEntries — explode=false (従来挙動)", () => {
  test("explode=false なら articles を 1:1 mapping (imageSrc=null, imageIndex=null)", () => {
    const articles = [makeArticle("a"), makeArticle("b")];
    const result = explodeArticlesIntoGalleryEntries(articles, {
      explode: false,
      prefetchedImagesByArticleId: () => ["img-x.jpg"], // 渡されても無視される
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      article: articles[0],
      imageSrc: null,
      imageIndex: null,
      totalImages: null,
      key: "a",
    });
    expect(result[1]).toMatchObject({
      article: articles[1],
      imageSrc: null,
      imageIndex: null,
      totalImages: null,
      key: "b",
    });
  });

  test("explode=false で空配列を渡すと空配列を返す", () => {
    const result = explodeArticlesIntoGalleryEntries([], {
      explode: false,
      prefetchedImagesByArticleId: () => undefined,
    });
    expect(result).toEqual([]);
  });
});

test.describe("explodeArticlesIntoGalleryEntries — explode=true (画像分解)", () => {
  test("prefetched 完了 + N 画像なら N entry に展開 (本文出現順)", () => {
    const article = makeArticle("a");
    const result = explodeArticlesIntoGalleryEntries([article], {
      explode: true,
      prefetchedImagesByArticleId: () => ["img-1.jpg", "img-2.jpg", "img-3.jpg"],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      article,
      imageSrc: "img-1.jpg",
      imageIndex: 0,
      totalImages: 3,
      key: "a-0",
    });
    expect(result[1]).toMatchObject({
      article,
      imageSrc: "img-2.jpg",
      imageIndex: 1,
      totalImages: 3,
      key: "a-1",
    });
    expect(result[2]).toMatchObject({
      article,
      imageSrc: "img-3.jpg",
      imageIndex: 2,
      totalImages: 3,
      key: "a-2",
    });
  });

  test("prefetched 未完了 (undefined) なら 1 entry (totalImages=null で placeholder fallback)", () => {
    const article = makeArticle("a");
    const result = explodeArticlesIntoGalleryEntries([article], {
      explode: true,
      prefetchedImagesByArticleId: () => undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      article,
      imageSrc: null,
      imageIndex: null,
      totalImages: null,
      key: "a",
    });
  });

  test("prefetched 空配列なら 1 entry (totalImages=0、本文画像なしを明示)", () => {
    const article = makeArticle("a");
    const result = explodeArticlesIntoGalleryEntries([article], {
      explode: true,
      prefetchedImagesByArticleId: () => [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      article,
      imageSrc: null,
      imageIndex: null,
      totalImages: 0,
      key: "a",
    });
  });

  test("複数記事で記事順 × 同一記事内画像順を保つ", () => {
    const a = makeArticle("a");
    const b = makeArticle("b");
    const c = makeArticle("c");
    const result = explodeArticlesIntoGalleryEntries([a, b, c], {
      explode: true,
      prefetchedImagesByArticleId: (id) => {
        if (id === "a") return ["a1.jpg", "a2.jpg"];
        if (id === "b") return undefined; // 未完了
        return ["c1.jpg"];
      },
    });
    // a (2 件) + b (1 件 placeholder) + c (1 件) = 4 entries
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.key)).toEqual(["a-0", "a-1", "b", "c-0"]);
    expect(result.map((e) => e.article.id)).toEqual(["a", "a", "b", "c"]);
  });

  test("entry の key はすべて unique", () => {
    const a = makeArticle("a");
    const b = makeArticle("b");
    const result = explodeArticlesIntoGalleryEntries([a, b], {
      explode: true,
      prefetchedImagesByArticleId: (id) => (id === "a" ? ["x.jpg", "y.jpg", "z.jpg"] : ["w.jpg"]),
    });
    const keys = result.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("空配列を渡すと空配列を返す", () => {
    const result = explodeArticlesIntoGalleryEntries([], {
      explode: true,
      prefetchedImagesByArticleId: () => ["x.jpg"],
    });
    expect(result).toEqual([]);
  });

  test("1 記事 50 画像でも上限なしで全件展開 (ユーザー仕様: 上限なし)", () => {
    const article = makeArticle("a");
    const images = Array.from({ length: 50 }, (_, i) => `img-${i}.jpg`);
    const result = explodeArticlesIntoGalleryEntries([article], {
      explode: true,
      prefetchedImagesByArticleId: () => images,
    });
    expect(result).toHaveLength(50);
    expect(result[0].imageIndex).toBe(0);
    expect(result[49].imageIndex).toBe(49);
    expect(result[49].totalImages).toBe(50);
  });
});

test.describe("explodeArticlesIntoGalleryEntries — 型契約", () => {
  test("戻り値の GalleryEntry は article reference を保持 (既読/ブックマーク状態の参照元)", () => {
    const article = makeArticle("a");
    const result: GalleryEntry[] = explodeArticlesIntoGalleryEntries([article], {
      explode: true,
      prefetchedImagesByArticleId: () => ["x.jpg", "y.jpg"],
    });
    // 全 entry が同じ article reference を共有する (既読 toggle が全画像カードに反映されるため)
    expect(result[0].article).toBe(article);
    expect(result[1].article).toBe(article);
  });
});
