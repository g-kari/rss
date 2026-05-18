import { test, expect } from "@playwright/test";
import { selectPrefetchTargets, DEFAULT_PREFETCH_OPTIONS } from "../src/lib/cron-prefetch";
import type { Article, EngagementEntry } from "../src/types";

/**
 * #803 Phase 2: cron prefetch 対象 URL 構築純粋関数 spec。
 *
 * `aggregateGlobalTopFeeds` (Phase 1) の集約結果と各 feed の最新記事配列から、
 * prefetch 対象 URL リストを構築する spec。link 空 / 重複除外 / maxArticlesPerFeed
 * 制限 / topN 制限 / feed の優先順位 × 記事の publishedAt 降順を検証する。
 */

const NOW = new Date("2026-05-18T10:00:00Z").getTime();

function makeEntry(
  feedHash: string,
  action: EngagementEntry["action"],
  hoursAgo: number,
): EngagementEntry {
  return {
    articleId: `a-${feedHash}-${hoursAgo}`,
    feedHash,
    action,
    timestamp: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString(),
  };
}

function makeArticle(id: string, feedHash: string, link: string, hoursAgo = 0): Article {
  return {
    id,
    feedHash,
    guid: id,
    title: `title-${id}`,
    link,
    summary: "",
    publishedAt: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString(),
  };
}

test.describe("selectPrefetchTargets — prefetch 対象 URL 構築", () => {
  test("空入力 (engagement entries 空) → 空配列", () => {
    expect(selectPrefetchTargets([], new Map(), DEFAULT_PREFETCH_OPTIONS)).toEqual([]);
  });

  test("engagement あるが feedArticles に該当 feed がない → 空配列", () => {
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 0)]];
    expect(selectPrefetchTargets(entries, new Map(), DEFAULT_PREFETCH_OPTIONS)).toEqual([]);
  });

  test("1 feed × 1 記事 → 1 URL", () => {
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 0)]];
    const feedArticles = new Map<string, Article[]>([
      ["feed-A", [makeArticle("a1", "feed-A", "https://a.example/1")]],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 3,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual(["https://a.example/1"]);
  });

  test("1 feed × 5 記事 + maxArticlesPerFeed=3 → 最初 3 件のみ", () => {
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 0)]];
    const feedArticles = new Map<string, Article[]>([
      [
        "feed-A",
        [
          makeArticle("a1", "feed-A", "https://a.example/1"),
          makeArticle("a2", "feed-A", "https://a.example/2"),
          makeArticle("a3", "feed-A", "https://a.example/3"),
          makeArticle("a4", "feed-A", "https://a.example/4"),
          makeArticle("a5", "feed-A", "https://a.example/5"),
        ],
      ],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 3,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual(["https://a.example/1", "https://a.example/2", "https://a.example/3"]);
  });

  test("複数 feed (totalScore 降順) → feed の優先順位通り", () => {
    // feed-A: like × 2 ユーザー = score 10, feed-B: like × 1 = score 5
    const entries: EngagementEntry[][] = [
      [makeEntry("feed-A", "like", 0), makeEntry("feed-B", "like", 0)],
      [makeEntry("feed-A", "like", 0)],
    ];
    const feedArticles = new Map<string, Article[]>([
      ["feed-A", [makeArticle("a1", "feed-A", "https://a.example/1")]],
      ["feed-B", [makeArticle("b1", "feed-B", "https://b.example/1")]],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 3,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual(["https://a.example/1", "https://b.example/1"]);
  });

  test("topN=1 で複数 feed → 上位 1 feed のみ", () => {
    const entries: EngagementEntry[][] = [
      [makeEntry("feed-A", "like", 0), makeEntry("feed-B", "like", 0)],
      [makeEntry("feed-A", "like", 0)],
    ];
    const feedArticles = new Map<string, Article[]>([
      ["feed-A", [makeArticle("a1", "feed-A", "https://a.example/1")]],
      ["feed-B", [makeArticle("b1", "feed-B", "https://b.example/1")]],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 1,
      maxArticlesPerFeed: 3,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual(["https://a.example/1"]);
  });

  test("link 空文字列の記事はスキップ", () => {
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 0)]];
    const feedArticles = new Map<string, Article[]>([
      [
        "feed-A",
        [
          makeArticle("a1", "feed-A", "https://a.example/1"),
          makeArticle("a2", "feed-A", ""), // link 空
          makeArticle("a3", "feed-A", "https://a.example/3"),
        ],
      ],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 3,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual(["https://a.example/1", "https://a.example/3"]);
  });

  test("同一 URL の記事が複数 feed に渡る場合は重複排除", () => {
    const entries: EngagementEntry[][] = [
      [makeEntry("feed-A", "like", 0), makeEntry("feed-B", "like", 0)],
      [makeEntry("feed-A", "like", 0)],
    ];
    const feedArticles = new Map<string, Article[]>([
      ["feed-A", [makeArticle("a1", "feed-A", "https://shared.example/1")]],
      ["feed-B", [makeArticle("b1", "feed-B", "https://shared.example/1")]], // 同 URL
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 3,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual(["https://shared.example/1"]);
  });

  test("minScore=10.0 で全 feed が閾値未満 → 空配列", () => {
    // like の重み 5.0、1 user 1 like なので score=5.0 < 10.0 で除外
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 0)]];
    const feedArticles = new Map<string, Article[]>([
      ["feed-A", [makeArticle("a1", "feed-A", "https://a.example/1")]],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 3,
      minScore: 10.0,
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  test("DEFAULT_PREFETCH_OPTIONS の値 (topN=50 / maxArticlesPerFeed=3 / minScore=1.0)", () => {
    expect(DEFAULT_PREFETCH_OPTIONS.topN).toBe(50);
    expect(DEFAULT_PREFETCH_OPTIONS.maxArticlesPerFeed).toBe(3);
    expect(DEFAULT_PREFETCH_OPTIONS.minScore).toBe(1.0);
  });

  test("feed-A: 2 記事 + feed-B: 2 記事 (maxArticlesPerFeed=2) → 計 4 URL", () => {
    const entries: EngagementEntry[][] = [
      [makeEntry("feed-A", "like", 0), makeEntry("feed-B", "like", 0)],
      [makeEntry("feed-A", "like", 0), makeEntry("feed-B", "like", 0)],
    ];
    const feedArticles = new Map<string, Article[]>([
      [
        "feed-A",
        [
          makeArticle("a1", "feed-A", "https://a.example/1"),
          makeArticle("a2", "feed-A", "https://a.example/2"),
          makeArticle("a3", "feed-A", "https://a.example/3"),
        ],
      ],
      [
        "feed-B",
        [
          makeArticle("b1", "feed-B", "https://b.example/1"),
          makeArticle("b2", "feed-B", "https://b.example/2"),
        ],
      ],
    ]);
    const result = selectPrefetchTargets(entries, feedArticles, {
      topN: 50,
      maxArticlesPerFeed: 2,
      minScore: 1.0,
      now: NOW,
    });
    expect(result).toEqual([
      "https://a.example/1",
      "https://a.example/2",
      "https://b.example/1",
      "https://b.example/2",
    ]);
  });
});
