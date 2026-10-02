import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useFilteredArticles } from "./useFilteredArticles";
import { rankArticleRecommendations } from "../lib/article-recommendations";
import { computeEffectiveReadBeforeCutoff } from "../lib/read-state-prune";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { getImmersiveCandidates } from "../lib/immersive-articles";

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
    expect(result.current.recommendationCandidates?.map((article) => article.id)).toEqual(["safe"]);
  });
});

describe("strict scoped recommendation candidates", () => {
  const feeds = [makeFeed({ id: "a", category: "tech" }), makeFeed({ id: "b", category: "other" })];
  const article = (id: string, feedHash = "a") =>
    makeArticle({
      id,
      guid: id,
      feedHash,
      title: id,
      link: `https://example.com/${id}`,
      publishedAt: new Date(NOW).toISOString(),
      author: id,
    });
  const options = {
    articles: [article("picked"), article("active"), article("other", "b")],
    feeds,
    feedId: null,
    readIds: EMPTY,
    bookmarkIds: new Set(["picked"]),
    readingListIds: new Set(["picked"]),
    likeIds: new Set(["picked"]),
    notes: { picked: "A saved note" },
    globalFilter: null,
    setGlobalFilter: noop,
  };
  const ids = (entries: typeof options.articles | undefined) => entries?.map((entry) => entry.id);
  const immersiveIds = (state: ReturnType<typeof useFilteredArticles>) =>
    ids(
      getImmersiveCandidates({
        ...options,
        candidates: state.recommendationCandidates ?? [],
        articles: state.recommendationSources ?? [],
        historyIds: EMPTY,
        dismissedIds: EMPTY,
        now: NOW,
      }),
    );

  it.each([
    "toggleBookmarkOnly",
    "toggleReadingListOnly",
    "toggleLikeOnly",
    "toggleNoteOnly",
  ] as const)("preserves %s while excluding the reader's retained selection", (toggle) => {
    const { result } = renderHook(() =>
      useFilteredArticles({ ...options, selectedArticleId: "active" }),
    );
    act(() => result.current[toggle]());
    expect(ids(result.current.filtered)).toEqual(["picked", "active"]);
    expect(ids(result.current.recommendationCandidates)).toEqual(["picked"]);
    expect(ids(result.current.recommendationDisplayCandidates)).toEqual(["picked"]);
  });

  it.each([
    { feedId: "a", expected: ["picked", "active"] },
    { groupFeedIds: new Set(["a"]), selectedGroupId: "group", expected: ["picked", "active"] },
    { selectedTag: "Unity", articleTags: { picked: ["Unity"] }, expected: ["picked"] },
    { collectionArticleIds: new Set(["picked"]), expected: ["picked"] },
    {
      activeFeedView: "videos" as const,
      feeds: [makeFeed({ id: "a", view: "videos" }), feeds[1]],
      expected: ["picked", "active"],
    },
    {
      activeFeedView: "pictures" as const,
      feeds: [makeFeed({ id: "a", view: "pictures" }), feeds[1]],
      expected: ["picked", "active"],
    },
    {
      activeFeedView: "social" as const,
      feeds: [makeFeed({ id: "a", view: "social" }), feeds[1]],
      expected: ["picked", "active"],
    },
  ])(
    "retains the selected feed/group/tag/collection/view scope: $expected",
    ({ expected, ...scope }) => {
      const { result } = renderHook(() => useFilteredArticles({ ...options, ...scope }));
      expect(ids(result.current.recommendationCandidates)).toEqual(expected);
    },
  );

  it.each([undefined, "articles", "videos"] as const)(
    "keeps an explicitly empty group empty in view %s, including retained articles",
    (activeFeedView) => {
      const { result } = renderHook(() =>
        useFilteredArticles({
          ...options,
          groupFeedIds: new Set<string>(),
          selectedGroupId: "empty-group",
          selectedArticleId: "active",
          activeFeedView,
        }),
      );
      expect(result.current.filtered).toEqual([]);
      expect(result.current.recommendationSources).toEqual([]);
      expect(result.current.recommendationCandidates).toEqual([]);
      expect(immersiveIds(result.current)).toEqual([]);
    },
  );

  it("does not widen the pool when the selected group's final feed is removed", () => {
    const { result, rerender } = renderHook(
      ({ groupFeedIds }) =>
        useFilteredArticles({ ...options, groupFeedIds, selectedGroupId: "group" }),
      { initialProps: { groupFeedIds: new Set(["a"]) } },
    );
    expect(ids(result.current.recommendationCandidates)).toEqual(["picked", "active"]);
    rerender({ groupFeedIds: new Set() });
    expect(result.current.filtered).toEqual([]);
    expect(result.current.recommendationSources).toEqual([]);
    expect(result.current.recommendationCandidates).toEqual([]);
    expect(immersiveIds(result.current)).toEqual([]);
  });

  it("combines persisted saved/date filters with author, category and debounced search", () => {
    const { result } = renderHook(() => useFilteredArticles(options));
    act(() => {
      result.current.toggleBookmarkOnly();
      result.current.toggleReadingListOnly();
      result.current.toggleLikeOnly();
      result.current.toggleNoteOnly();
      result.current.cycleDateRange();
      result.current.setAuthorFilter("picked");
      result.current.setCategoryFilter("tech");
      result.current.updateQuery("picked");
    });
    act(() => vi.advanceTimersByTime(600));
    expect(ids(result.current.recommendationCandidates)).toEqual(["picked"]);
    expect(result.current.query).toBe("picked");
    expect(result.current.dateRange).toBe("today");
    expect(result.current.bookmarkOnly).toBe(true);
    expect(result.current.readingListOnly).toBe(true);
    expect(result.current.likeOnly).toBe(true);
    expect(result.current.noteOnly).toBe(true);
  });

  it("excludes retained selections that fail author or reading-time filters", () => {
    const long = { ...article("active"), summary: "long words ".repeat(3000) };
    const { result } = renderHook(() =>
      useFilteredArticles({
        ...options,
        articles: [article("picked"), long],
        selectedArticleId: "active",
      }),
    );
    act(() => result.current.setAuthorFilter("picked"));
    expect(ids(result.current.filtered)).toContain("active");
    expect(ids(result.current.recommendationCandidates)).toEqual(["picked"]);
    act(() => {
      result.current.setAuthorFilter(null);
      result.current.cycleReadingTimeRange();
    });
    expect(result.current.readingTimeRange).not.toBe("all");
    expect(ids(result.current.filtered)).toContain("active");
    expect(ids(result.current.recommendationCandidates)).toEqual(["picked"]);
  });

  it.each(["0", "4"])(
    "keeps the true digest window when article %s is retained",
    (selectedArticleId) => {
      const articles = Array.from({ length: 5 }, (_, index) => ({
        ...article(String(index)),
        publishedAt: new Date(NOW - index * 60000).toISOString(),
      }));
      const { result } = renderHook(() =>
        useFilteredArticles({ ...options, articles, selectedArticleId }),
      );
      act(() => result.current.toggleDigestMode());
      expect(ids(result.current.recommendationCandidates)).toEqual(["0", "1", "2"]);
      expect(result.current.digestMode).toBe(true);
    },
  );

  it.each(["0", "4"])(
    "keeps the special Digest feed's true window with its toggle off and article %s retained",
    (selectedArticleId) => {
      const articles = Array.from({ length: 5 }, (_, index) => ({
        ...article(String(index)),
        publishedAt: new Date(NOW - index * 60000).toISOString(),
      }));
      const { result } = renderHook(() =>
        useFilteredArticles({
          ...options,
          articles,
          feedId: SPECIAL_FEED_IDS.DIGEST,
          selectedArticleId,
        }),
      );
      expect(result.current.digestMode).toBe(false);
      expect(ids(result.current.recommendationCandidates)).toEqual(["0", "1", "2"]);
      expect(immersiveIds(result.current)).toEqual(["0", "1", "2"]);
    },
  );

  it("keeps an empty filtered result empty instead of sourcing other articles", () => {
    const { result } = renderHook(() => useFilteredArticles(options));
    act(() => result.current.updateQuery("missing-result"));
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.recommendationCandidates).toEqual([]);
  });
});
