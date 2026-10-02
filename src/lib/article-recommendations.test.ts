import { describe, expect, it } from "vitest";
import {
  rankArticleRecommendations,
  type ArticleRecommendationOptions,
} from "./article-recommendations";
import type { Article, Feed } from "../types";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const DAY = 86400000;
const feeds: Feed[] = ["a", "b", "c"].map((id) => ({
  id,
  title: id,
  url: `https://${id}.example/feed`,
  siteUrl: `https://${id}.example`,
  lastFetchedAt: null,
  fetchError: null,
}));
function article(id: string, feedHash = "a", daysAgo = 0, categories?: string[]): Article {
  return {
    id,
    feedHash,
    title: id,
    link: `https://example.com/${id}`,
    guid: id,
    summary: "",
    publishedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    categories,
  };
}
function rank(candidates: Article[], options: Partial<ArticleRecommendationOptions> = {}) {
  return rankArticleRecommendations({
    candidates,
    articles: candidates,
    feeds,
    readIds: new Set(),
    bookmarkIds: new Set(),
    readingListIds: new Set(),
    likeIds: new Set(),
    historyIds: new Set(),
    dismissedIds: new Set(),
    now: NOW,
    ...options,
  });
}

describe("rankArticleRecommendations", () => {
  it("cold start chooses fresh unread articles with honest reasons", () => {
    const result = rank([article("old", "a", 20), article("fresh", "a", 0.2)]);
    expect(result[0].article.id).toBe("fresh");
    expect(result[0].reasons).toContain("24時間以内の新着");
    expect(result[0].reasons.join(" ")).not.toContain("よく読む");
  });
  it("excludes explicit reads, bulk reads, dismissed articles and muted feeds", () => {
    const result = rank(
      [
        article("read"),
        article("bulk", "a", 10),
        article("dismissed"),
        article("muted", "b"),
        article("valid", "c"),
      ],
      {
        readIds: new Set(["read"]),
        readBeforeTimestamp: new Date(NOW - DAY).toISOString(),
        dismissedIds: new Set(["dismissed"]),
        feeds: feeds.map((f) =>
          f.id === "b" ? { ...f, mutedUntil: new Date(NOW + DAY).toISOString() } : f,
        ),
      },
    );
    expect(result.map((r) => r.article.id)).toEqual(["valid"]);
  });
  it("learns topics from viewed and saved articles, without treating bulk mark-read as interest", () => {
    const liked = article("liked", "a", 2, ["Ｕｎｉｔｙ"]);
    const relevant = article("relevant", "b", 0, ["unity"]);
    const unrelated = article("unrelated", "c", 0, ["Cooking"]);
    const result = rank([unrelated, relevant], {
      articles: [liked, relevant, unrelated],
      likeIds: new Set([liked.id]),
    });
    expect(result[0].article.id).toBe("relevant");
    expect(result[0].reasons).toContain("保存・いいねした記事と同じテーマ: unity");
    const readOnly = rank([unrelated, relevant], {
      articles: [liked, relevant, unrelated],
      readIds: new Set([liked.id]),
    });
    expect(readOnly.every((r) => !r.reasons.some((s) => s.includes("テーマ")))).toBe(true);
  });
  it("balances publishers even when one feed has many matching stories", () => {
    const result = rank([
      article("a1"),
      article("a2"),
      article("a3"),
      article("b1", "b"),
      article("c1", "c"),
    ]);
    expect(new Set(result.map((r) => r.article.feedHash)).size).toBe(3);
    expect(result).toHaveLength(3);
  });
  it("deduplicates links and IDs and is stable regardless of input order", () => {
    const original = article("a1");
    const duplicate = { ...article("b1", "b"), link: original.link };
    const input = [original, duplicate, original, article("c1", "c")];
    expect(rank(input).map((r) => r.article.id)).toEqual(
      rank(input.slice().reverse()).map((r) => r.article.id),
    );
    expect(rank(input)).toHaveLength(2);
  });
  it("uses createdAt for missing dates and does not call future or malformed dates new", () => {
    const result = rank([
      { ...article("missing"), publishedAt: null },
      { ...article("bad", "b"), publishedAt: "bad" },
      article("future", "c", -5),
    ]);
    expect(result[0].article.id).toBe("missing");
    expect(result.find((r) => r.article.id === "future")?.reasons).not.toContain(
      "24時間以内の新着",
    );
    expect(result.find((r) => r.article.id === "bad")?.reasons).not.toContain("24時間以内の新着");
  });
  it("never adds articles outside the supplied candidate set", () => {
    const outside = article("outside", "a");
    expect(rank([], { articles: [outside], bookmarkIds: new Set([outside.id]) })).toEqual([]);
    expect(rank([article("only")], { articles: [outside], limit: 0 })).toEqual([]);
  });
  it("counts duplicate signal article IDs only once", () => {
    const history = article("history", "a", 1, ["Unity"]);
    const fresh = article("fresh", "b", 0, ["Cooking"]);
    const related = article("related", "c", 1, ["Unity"]);
    const options = { historyIds: new Set([history.id]) };
    const once = rank([fresh, related], { ...options, articles: [history] });
    const duplicated = rank([fresh, related], {
      ...options,
      articles: Array.from({ length: 30 }, () => history),
    });
    expect(duplicated).toEqual(once);
    expect(once[0].article.id).toBe("fresh");
  });
  it("does not let dismissed articles affect other articles' ranking", () => {
    const related = article("related", "b", 0, ["Unity"]);
    const unrelated = article("unrelated", "c", 0, ["Cooking"]);
    const hidden = article("hidden", "a", 0, ["Unity"]);
    const without = rank([related, unrelated]);
    const dismissed = rank([related, unrelated, hidden], { dismissedIds: new Set([hidden.id]) });
    expect(dismissed).toEqual(without);
  });
});

describe("actual explanations and explicit topic ranking", () => {
  it("returns the exact scorer contributions including publisher diversity", () => {
    const signal = article("signal", "a", 4, ["Unity"]);
    const result = rank([article("a1", "a", 0, ["Unity"]), article("a2", "a", 0, ["Unity"])], {
      articles: [signal],
      bookmarkIds: new Set(["signal"]),
      feeds: feeds.map((feed) => ({ ...feed, priority: "high" })),
    });
    const first = result[0].explanation!;
    expect(first.freshness.points).toBe(8);
    expect(first.interest.points).toBe(4.5);
    expect(first.feed.points).toBe(3);
    expect(first.priorityPoints).toBe(2);
    expect(first.interest.saved).toBe(true);
    expect(first.total).toBe(17.5);
    const second = result[1].explanation!;
    expect(second.diversityPenalty).toBe(14);
    expect(second.total).toBe(3.5);
    for (const { explanation: detail } of result) {
      expect(detail!.total).toBeCloseTo(
        detail!.freshness.points +
          detail!.interest.points +
          detail!.feed.points +
          detail!.priorityPoints +
          detail!.preferencePoints -
          detail!.diversityPenalty,
      );
    }
  });
  it("more/less really change order and neutral restores the original ranking", () => {
    const candidates = [article("a", "a", 0, ["Cooking"]), article("z", "b", 0, ["Ｕｎｉｔｙ"])];
    const baseline = rank(candidates);
    const more = rank(candidates, {
      topicPreferences: [{ topic: "unity", label: "Unity", value: "more" }],
    });
    expect(baseline[0].article.id).toBe("a");
    expect(more[0].article.id).toBe("z");
    expect(more[0].explanation!.preferencePoints).toBe(6);
    const less = rank(candidates, {
      topicPreferences: [{ topic: "cooking", label: "Cooking", value: "less" }],
    });
    expect(less[0].article.id).toBe("z");
    expect(less).toHaveLength(2);
    expect(rank(candidates, { topicPreferences: [] })).toEqual(baseline);
  });
  it("caps multi-tag adjustments, cancels opposing choices and uses feed categories", () => {
    const preferences = ["Unity", "AI", "Tools"].map((label) => ({
      topic: label.toLowerCase(),
      label,
      value: "more" as const,
    }));
    const result = rank([article("tags", "a", 0, ["Unity", "unity", "AI", "Tools"])], {
      topicPreferences: preferences,
    });
    expect(result[0].explanation!.preferencePoints).toBe(6);
    expect(result[0].explanation!.preferences).toHaveLength(3);
    const opposing = rank([article("mixed", "a", 0, ["AI", "Tools"])], {
      topicPreferences: [preferences[1], { ...preferences[2], value: "less" }],
    });
    expect(opposing[0].explanation!.preferencePoints).toBe(0);
    expect(opposing[0].reasons.join(" ")).not.toContain("増やしたい");
    expect(
      rank([article("feed-tag")], {
        feeds: feeds.map((feed) => ({ ...feed, category: "Unity" })),
        topicPreferences: preferences,
      })[0].explanation!.preferencePoints,
    ).toBe(6);
  });
  it("cannot escape candidate/read/dismiss/mute filters or train from bulk read", () => {
    const preference = [{ topic: "unity", label: "Unity", value: "more" as const }];
    const excluded = article("excluded", "a", 0, ["Unity"]);
    expect(rank([], { articles: [excluded], topicPreferences: preference })).toEqual([]);
    expect(
      rank([excluded], { readIds: new Set(["excluded"]), topicPreferences: preference }),
    ).toEqual([]);
    expect(
      rank([excluded], { dismissedIds: new Set(["excluded"]), topicPreferences: preference }),
    ).toEqual([]);
    const result = rank([article("only", "b", 0, ["Unity"])], {
      articles: [excluded],
      readIds: new Set(["excluded"]),
      topicPreferences: preference,
    });
    expect(result[0].explanation!.interest.points).toBe(0);
  });
  it("explains missing, future and invalid dates without inventing freshness", () => {
    const missing = rank([{ ...article("missing"), publishedAt: null }])[0];
    expect(missing.explanation!.freshness.source).toBe("received");
    expect(missing.reasons).toContain("24時間以内に取得");
    for (const articleValue of [
      article("future", "a", -1),
      { ...article("invalid"), publishedAt: "bad" },
    ]) {
      const detail = rank([articleValue])[0].explanation!;
      expect(detail.freshness.ageHours).toBeNull();
      expect(detail.freshness.points).toBe(0);
    }
  });
});
