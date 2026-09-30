import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useFilteredArticles } from "./useFilteredArticles";
import { rankArticleRecommendations } from "../lib/article-recommendations";
import { computeEffectiveReadBeforeCutoff } from "../lib/read-state-prune";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const EMPTY = new Set<string>();
const noop = () => {};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("filtered recommendation evidence", () => {
  it("keeps a read feed's saved topics in unread-only mode while excluding hidden content", () => {
    const feeds = [
      makeFeed({ id: "a" }),
      makeFeed({ id: "b" }),
      makeFeed({ id: "secret", nsfw: true }),
      makeFeed({ id: "pictures", view: "pictures" }),
      makeFeed({ id: "muted" }),
    ];
    const article = (id: string, feedHash: string) =>
      makeArticle({
        id,
        guid: id,
        feedHash,
        title: id,
        link: `https://example.com/${id}`,
        categories: ["Unity"],
        publishedAt: new Date(NOW).toISOString(),
      });
    const articles = [
      article("read", "a"),
      article("fresh", "b"),
      article("secret", "secret"),
      article("picture", "pictures"),
      article("muted", "muted"),
      article("blocked", "a"),
      article("snoozed", "b"),
    ];
    const readIds = new Set(["read"]);
    const bookmarkIds = new Set(["read"]);
    const options = {
      articles,
      feeds,
      feedId: null,
      readIds,
      bookmarkIds,
      readingListIds: EMPTY,
      globalFilter: { include: [], exclude: ["blocked"] },
      setGlobalFilter: noop,
      activeFeedView: "articles" as const,
      nsfwFeedIds: new Set(["secret"]),
      mutedFeedIds: new Set(["muted"]),
      snoozedUntil: { snoozed: new Date(NOW + 86400000).toISOString() },
    };
    const { result } = renderHook(() => useFilteredArticles(options));
    act(() => result.current.toggleUnreadOnly());
    expect(result.current.filtered.map((entry) => entry.id)).toEqual(["fresh"]);
    expect(result.current.recommendationSources?.map((entry) => entry.id)).toEqual([
      "read",
      "fresh",
    ]);
    const picks = rankArticleRecommendations({
      candidates: result.current.filtered,
      articles: result.current.recommendationSources ?? [],
      feeds,
      readIds,
      bookmarkIds,
      readingListIds: EMPTY,
      historyIds: EMPTY,
      likeIds: EMPTY,
      dismissedIds: EMPTY,
      now: NOW,
    });
    expect(picks[0].reasons).toContain("保存・いいねした記事と同じテーマ: Unity");
  });
  it("does not revive TTL-read articles when the all-articles list includes them", () => {
    const old = makeArticle({
      id: "old",
      feedHash: "a",
      publishedAt: new Date(NOW - 60 * 86400000).toISOString(),
    });
    const fresh = makeArticle({
      id: "fresh",
      feedHash: "a",
      link: "https://example.com/fresh",
      publishedAt: new Date(NOW).toISOString(),
    });
    const feeds = [makeFeed({ id: "a" })];
    const cutoff = computeEffectiveReadBeforeCutoff(null, 30, NOW);
    const { result } = renderHook(() =>
      useFilteredArticles({
        articles: [old, fresh],
        feeds,
        feedId: null,
        readIds: EMPTY,
        bookmarkIds: EMPTY,
        readingListIds: EMPTY,
        globalFilter: null,
        setGlobalFilter: noop,
        readBeforeTimestamp: cutoff,
      }),
    );
    expect(result.current.filtered).toHaveLength(2);
    const picks = rankArticleRecommendations({
      candidates: result.current.filtered,
      articles: result.current.recommendationSources ?? [],
      feeds,
      readIds: EMPTY,
      readBeforeTimestamp: cutoff,
      bookmarkIds: EMPTY,
      readingListIds: EMPTY,
      historyIds: EMPTY,
      likeIds: EMPTY,
      dismissedIds: EMPTY,
      now: NOW,
    });
    expect(picks.map((entry) => entry.article.id)).toEqual(["fresh"]);
  });
  it("does not learn from hidden active articles retained by the reader", () => {
    const feeds = [makeFeed({ id: "secret", nsfw: true }), makeFeed({ id: "safe" })];
    const articles = [
      makeArticle({ id: "secret", feedHash: "secret", categories: ["Unity"] }),
      makeArticle({
        id: "safe",
        feedHash: "safe",
        link: "https://example.com/safe",
        categories: ["Unity"],
      }),
    ];
    const { result } = renderHook(() =>
      useFilteredArticles({
        articles,
        feeds,
        feedId: null,
        readIds: EMPTY,
        bookmarkIds: new Set(["secret"]),
        readingListIds: EMPTY,
        globalFilter: null,
        setGlobalFilter: noop,
        nsfwFeedIds: new Set(["secret"]),
        nsfwMode: false,
        selectedArticleId: "secret",
      }),
    );
    expect(result.current.filtered.map((article) => article.id)).toContain("secret");
    expect(result.current.recommendationSources?.map((article) => article.id)).toEqual(["safe"]);
  });
});
