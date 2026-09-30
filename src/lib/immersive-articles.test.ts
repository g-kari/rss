import { describe, expect, it } from "vitest";
import {
  createImmersiveBatch,
  getImmersiveCandidates,
  immersiveExcerpt,
} from "./immersive-articles";
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
    expect(immersiveExcerpt({ ...articles[0]!, summary: "あ".repeat(500) })).toHaveLength(241);
  });
});
