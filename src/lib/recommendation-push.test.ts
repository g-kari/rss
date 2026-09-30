import { describe, expect, it } from "vitest";
import {
  recommendationDay,
  selectPushRecommendations,
  normalizeRecommendationDismissals,
} from "./recommendation-push";
import type { Article, Feed, PushConfig, ReadState } from "../types";

const NOW = Date.parse("2026-09-30T00:30:00Z");
const config: PushConfig = {
  subscriptions: [],
  recommendationEnabled: true,
  recommendationTime: "09:00",
  timezone: "Asia/Tokyo",
};
const state: ReadState = { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] };
const feeds: Feed[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  title: id,
  url: `https://${id}.example/rss`,
  siteUrl: `https://${id}.example`,
  lastFetchedAt: null,
  fetchError: null,
}));
const article = (id: string, feedHash = "a", age = 0): Article => ({
  id,
  feedHash,
  title: id,
  guid: id,
  link: `https://example.com/${id}`,
  summary: "",
  publishedAt: new Date(NOW - age).toISOString(),
  createdAt: new Date(NOW - age).toISOString(),
});

describe("recommendation schedule", () => {
  it("requires opt-in, a valid half-hour time, and a timezone", () => {
    expect(recommendationDay(config, NOW)).toBe("2026-09-30");
    for (const change of [
      { recommendationEnabled: false },
      { recommendationTime: "09:15" },
      { timezone: undefined },
      { timezone: "invalid" },
    ])
      expect(recommendationDay({ ...config, ...change }, NOW)).toBeNull();
    expect(recommendationDay(config, NOW - 3600000)).toBeNull();
  });
  it("respects overnight quiet hours and catches up only in the current local day", () => {
    expect(
      recommendationDay({ ...config, silentStart: "22:00", silentEnd: "10:00" }, NOW),
    ).toBeNull();
    expect(recommendationDay(config, Date.parse("2026-09-30T14:30:00Z"))).toBe("2026-09-30");
    expect(recommendationDay(config, Date.parse("2026-09-30T15:00:00Z"))).toBeNull();
  });
  it("handles skipped and repeated DST hours with the same local-date idempotency key", () => {
    const ny = { ...config, timezone: "America/New_York", recommendationTime: "02:30" };
    expect(recommendationDay(ny, Date.parse("2026-03-08T07:00:00Z"))).toBe("2026-03-08");
    const fall = { ...ny, recommendationTime: "01:00" };
    expect(recommendationDay(fall, Date.parse("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
    expect(recommendationDay(fall, Date.parse("2026-11-01T06:30:00Z"))).toBe("2026-11-01");
  });
});

describe("recommendation candidate safety", () => {
  it("excludes reads, bulk/TTL reads, dismissals, snoozes, NSFW, muted/disabled feeds, keyword blocks and stale dates", () => {
    const articles = [
      article("read"),
      article("dismissed"),
      article("snoozed"),
      article("blocked"),
      article("adult", "b"),
      article("muted", "c"),
      article("disabled", "d"),
      article("old", "a", 8 * 86400000),
      article("future", "a", -1000),
      article("fresh"),
    ];
    const result = selectPushRecommendations(
      articles,
      [
        { ...feeds[0] },
        { ...feeds[1], nsfw: true },
        { ...feeds[2], mutedUntil: new Date(NOW + 10000).toISOString() },
        feeds[3],
      ],
      {
        ...state,
        readIds: ["read"],
        snoozedUntil: { snoozed: new Date(NOW + 10000).toISOString() },
        globalFilter: { include: [], exclude: ["blocked"] },
      },
      {
        ...config,
        disabledFeeds: { d: true },
        recommendationDismissals: [{ articleId: "dismissed", dismissedAt: NOW }],
      },
      [],
      NOW,
    );
    expect(result.map((x) => x.article.id)).toEqual(["fresh"]);
    expect(
      selectPushRecommendations(
        [article("old", "a", 2 * 86400000)],
        feeds,
        { ...state, ttlDays: 1 },
        config,
        [],
        NOW,
      ),
    ).toEqual([]);
    expect(
      selectPushRecommendations(
        [article("fresh")],
        feeds,
        { ...state, readBeforeTimestamp: new Date(NOW).toISOString() },
        config,
        [],
        NOW,
      ),
    ).toEqual([]);
  });
  it("never recommends more than three and excludes previously planned IDs and links", () => {
    const articles = [article("1", "a"), article("2", "b"), article("3", "c"), article("4", "d")];
    expect(selectPushRecommendations(articles, feeds, state, config, [], NOW)).toHaveLength(3);
    expect(
      selectPushRecommendations(
        articles,
        feeds,
        state,
        config,
        [{ articleId: "1", link: articles[1].link, at: NOW }],
        NOW,
      ).map((x) => x.article.id),
    ).toEqual(["3", "4"]);
  });
  it("bounds feedback and ignores malformed, expired and future values", () => {
    expect(
      normalizeRecommendationDismissals(
        [
          { articleId: "a", dismissedAt: NOW },
          { articleId: "a", dismissedAt: NOW },
          { articleId: "future", dismissedAt: NOW + 1 },
          { articleId: "old", dismissedAt: NOW - 30 * 86400000 },
          null,
        ],
        NOW,
      ),
    ).toEqual([{ articleId: "a", dismissedAt: NOW }]);
  });
});
