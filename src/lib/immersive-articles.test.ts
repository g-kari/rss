import { describe, expect, it } from "vitest";
import {
  createImmersiveBatch,
  getImmersiveCandidates,
  immersiveExcerpt,
  immersiveThumbnailSources,
  safeRecommendationThumbnail,
} from "./immersive-articles";
import { contentLruCache } from "./lru-cache";
import { getProviderContentCacheId } from "./slide-providers";
import type { ArticleRecommendationOptions } from "./article-recommendations";
import type { Article } from "../types";

const now = Date.parse("2026-09-30T12:00:00Z");
const articles: Article[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  feedHash: "a",
  guid: String(i),
  title: `記事 ${i}`,
  link: `https://example.com/${i}`,
  summary: "要約",
  publishedAt: new Date(now - i * 1000).toISOString(),
  createdAt: new Date(now).toISOString(),
}));
const options: ArticleRecommendationOptions = {
  candidates: articles,
  articles,
  feeds: [
    {
      id: "a",
      title: "Feed",
      url: "https://example.com/feed",
      siteUrl: "https://example.com",
      lastFetchedAt: null,
      fetchError: null,
    },
  ],
  readIds: new Set(),
  bookmarkIds: new Set(),
  readingListIds: new Set(),
  likeIds: new Set(),
  historyIds: new Set(),
  dismissedIds: new Set(),
  now,
};

describe("immersive article batches", () => {
  it("stops at 10 and never repeats IDs or duplicate links across explicitly requested batches", () => {
    const first = createImmersiveBatch(options, []);
    expect(first).toHaveLength(10);
    const duplicate = { ...articles[0]!, id: "duplicate" };
    const next = createImmersiveBatch(
      { ...options, candidates: [...articles, duplicate], articles: [...articles, duplicate] },
      first.map(({ article }) => article),
    );
    expect(next).toHaveLength(10);
    expect(
      next.some(({ article }) => first.some((item) => item.article.link === article.link)),
    ).toBe(false);
    expect(
      createImmersiveBatch(
        options,
        [...first, ...next].map(({ article }) => article),
      ),
    ).toHaveLength(5);
  });
  it("honors strict scope, read cutoff, muted feeds, and existing dismissal settings", () => {
    expect(
      getImmersiveCandidates({
        ...options,
        articles: articles.slice(0, 4),
        readIds: new Set(["0"]),
        dismissedIds: new Set(["1"]),
        readBeforeTimestamp: articles[3]!.publishedAt,
      }),
    ).toEqual([articles[2]]);
    expect(
      getImmersiveCandidates({
        ...options,
        feeds: [{ ...options.feeds[0]!, mutedUntil: new Date(now + 1000).toISOString() }],
      }),
    ).toEqual([]);
  });
  it("uses only existing text and bounds it without rendering feed HTML", () => {
    expect(immersiveExcerpt({ ...articles[0]!, summary: "<p>Hello &amp; <b>world</b></p>" })).toBe(
      "Hello & world",
    );
    expect(immersiveExcerpt({ ...articles[0]!, summary: "", content: "本文" })).toBe("本文");
    expect(immersiveExcerpt({ ...articles[0]!, summary: "<p> </p>", content: "本文" })).toBe(
      "本文",
    );
    expect(immersiveExcerpt({ ...articles[0]!, summary: "" })).toBe("");
    expect(immersiveExcerpt({ ...articles[0]!, summary: "あ".repeat(500) })).toHaveLength(500);
  });
});

it("uses supplied full-size body variants ahead of tiny feed metadata without inventing URLs", () => {
  const small = "https://example.com/photo-300x168.webp";
  const large = "https://example.com/photo-1600x900.webp";
  const article = {
    ...articles[0]!,
    ogImage: small,
    content: `<img src="${small}" srcset="${large} 1600w, https://example.com/photo-768x432.webp 768w, ${small} 300w">`,
  };
  expect(immersiveThumbnailSources(article, {})).toEqual([large, small]);
});

it("ends a bounded excerpt on a sentence boundary and reuses richer cached text", () => {
  const article = {
    ...articles[0]!,
    id: "sentence-boundary",
    summary: "短い説明",
    content: "本文の文です。".repeat(200),
  };
  const excerpt = immersiveExcerpt(article);
  expect(excerpt.length).toBeGreaterThan(1000);
  expect(excerpt.length).toBeLessThanOrEqual(1200);
  expect(excerpt).toMatch(/。$/);
  contentLruCache.set(
    getProviderContentCacheId(article.id, article.link),
    "取得済みの本文です。".repeat(120),
  );
  expect(immersiveExcerpt(article)).toContain("取得済みの本文です。");
});

it("reuses loaded body images, validates each candidate and accepts only authenticated clip image paths", () => {
  const article = {
    ...articles[0],
    id: "thumbnail-fixture",
    ogImage: "javascript:bad()",
    content: '<img src="https://example.com/body.jpg" width="640" height="480">',
    summary: '<img src="http://127.0.0.1/private"><img src="https://example.com/summary.jpg">',
  };
  expect(
    immersiveThumbnailSources(article, { [article.link]: "http://127.0.0.1/private" }),
  ).toEqual(["https://example.com/body.jpg", "https://example.com/summary.jpg"]);
  const clip = `/api/clip/images/${"a".repeat(64)}`;
  contentLruCache.set(getProviderContentCacheId(article.id, article.link), `<img src="${clip}">`);
  expect(immersiveThumbnailSources(article, {})[0]).toBe(clip);
  expect(safeRecommendationThumbnail("/api/clip/images/arbitrary")).toBeUndefined();
  expect(
    safeRecommendationThumbnail("/api/image-proxy?url=http%3A%2F%2F127.0.0.1%2Fa"),
  ).toBeUndefined();
});

it("does not let cached fulltext without images suppress an already-loaded RSS body image", () => {
  const article = {
    ...articles[0],
    id: "cached-text-without-image",
    content: '<img src="https://example.com/rss-body.jpg" width="800" height="450">',
    summary: "本文の説明",
  };
  contentLruCache.set(
    getProviderContentCacheId(article.id, article.link),
    "<p>取得済み全文に画像はない</p>",
  );
  expect(immersiveThumbnailSources(article, {})).toContain("https://example.com/rss-body.jpg");
});

it.each([
  '<img src="/api/image-proxy?url=%ZZ.jpg">',
  '<a href="/api/image-proxy?url=%ZZ.jpg">bad</a>',
  '<source srcset="/api/image-proxy?url=%ZZ.jpg 2x">',
])("skips malformed proxy candidate %s while retaining a valid neighboring body image", (bad) => {
  const article = {
    ...articles[0],
    id: `malformed-proxy-${bad}`,
    content: `${bad}<img src="https://example.com/good.jpg" width="800" height="450">`,
    summary: "",
  };
  expect(() => immersiveThumbnailSources(article, {})).not.toThrow();
  expect(immersiveThumbnailSources(article, {})).toEqual(["https://example.com/good.jpg"]);
});

it("keeps a valid reordered proxy after HTML entity normalization alongside malformed neighbors", () => {
  const encoded = encodeURIComponent("https://example.com/good-large.jpg");
  const content = `<img src="/api/image-proxy?url=%ZZ.jpg"><img src="/api/image-proxy?width=800&amp;url=${encoded}" width="800" height="450">`;
  expect(
    immersiveThumbnailSources(
      { ...articles[0], id: "encoded-reordered-proxy", content, summary: "" },
      {},
    ),
  ).toEqual([`/api/image-proxy?width=800&url=${encoded}`]);
});
