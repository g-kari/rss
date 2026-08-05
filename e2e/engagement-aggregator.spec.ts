import { test, expect } from "@playwright/test";
import { aggregateGlobalTopFeeds } from "../src/lib/engagement-aggregator";
import type { EngagementEntry } from "../src/types";

/**
 * #803 Phase 1: 全ユーザー engagement aggregation で top-N feed 集約する純粋関数 spec。
 *
 * Phase 2 / Phase 3 で cron 側 prefetch ロジックの基盤として使う。各ケースで
 * `now` を引数化することで時間減衰の挙動を固定する。
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

test.describe("aggregateGlobalTopFeeds — 全ユーザー engagement 集約", () => {
  test("空配列入力 → 空結果", () => {
    expect(aggregateGlobalTopFeeds([], 10, NOW)).toEqual([]);
  });

  test("1 ユーザー 1 feed の like → 1 件、score=like 重み (5.0) × 時間減衰", () => {
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 0)]];
    const result = aggregateGlobalTopFeeds(entries, 10, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].feedHash).toBe("feed-A");
    expect(result[0].totalScore).toBeCloseTo(5.0, 3); // 0 時間経過 → decay=1.0
    expect(result[0].userCount).toBe(1);
  });

  test("複数ユーザーが同じ feed に engagement → totalScore 加算 + userCount=2", () => {
    const user1: EngagementEntry[] = [makeEntry("feed-A", "like", 0)];
    const user2: EngagementEntry[] = [makeEntry("feed-A", "like", 0)];
    const result = aggregateGlobalTopFeeds([user1, user2], 10, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].feedHash).toBe("feed-A");
    expect(result[0].totalScore).toBeCloseTo(10.0, 3); // 5.0 + 5.0
    expect(result[0].userCount).toBe(2);
  });

  test("複数ユーザーが異なる feed に engagement → 別 entry で集約", () => {
    const user1: EngagementEntry[] = [makeEntry("feed-A", "like", 0)];
    const user2: EngagementEntry[] = [makeEntry("feed-B", "bookmark", 0)];
    const result = aggregateGlobalTopFeeds([user1, user2], 10, NOW);
    expect(result).toHaveLength(2);
    // feed-A の score=5.0 (like) > feed-B の score=4.0 (bookmark)
    expect(result[0].feedHash).toBe("feed-A");
    expect(result[0].userCount).toBe(1);
    expect(result[1].feedHash).toBe("feed-B");
    expect(result[1].userCount).toBe(1);
  });

  test("totalScore 降順で返す", () => {
    const user1: EngagementEntry[] = [
      makeEntry("feed-A", "reading_list", 0), // 2.0
      makeEntry("feed-B", "like", 0), // 5.0
      makeEntry("feed-C", "bookmark", 0), // 4.0
    ];
    const result = aggregateGlobalTopFeeds([user1], 10, NOW);
    expect(result.map((r) => r.feedHash)).toEqual(["feed-B", "feed-C", "feed-A"]);
  });

  test("limit で件数制限", () => {
    const user1: EngagementEntry[] = [
      makeEntry("feed-A", "like", 0),
      makeEntry("feed-B", "like", 0),
      makeEntry("feed-C", "like", 0),
    ];
    const result = aggregateGlobalTopFeeds([user1], 2, NOW);
    expect(result).toHaveLength(2);
  });

  test("limit が負数でも空結果を返す", () => {
    const user1: EngagementEntry[] = [makeEntry("feed-A", "like", 0)];
    expect(aggregateGlobalTopFeeds([user1], -1, NOW)).toEqual([]);
  });

  test("minScore 未満の feed は除外 (デフォルト 0.1)", () => {
    // 30 日前の like: 5.0 × decay(30d) ≈ 5.0 × 0.0935 ≈ 0.467
    // 60 日前の like: 5.0 × decay(60d) ≈ 5.0 × 0.00873 ≈ 0.044 (< 0.1)
    const user1: EngagementEntry[] = [
      makeEntry("feed-recent", "like", 0), // score ≈ 5.0
      makeEntry("feed-old", "like", 60 * 24), // score ≈ 0.044 → 除外
    ];
    const result = aggregateGlobalTopFeeds([user1], 10, NOW);
    expect(result.map((r) => r.feedHash)).toEqual(["feed-recent"]);
  });

  test("minScore=0 で全 feed を含める (テスト時の閾値解除用)", () => {
    const user1: EngagementEntry[] = [
      makeEntry("feed-recent", "like", 0),
      makeEntry("feed-old", "like", 60 * 24),
    ];
    const result = aggregateGlobalTopFeeds([user1], 10, NOW, 0);
    expect(result).toHaveLength(2);
  });

  test("同 user が同 feed に複数 engagement → userCount=1 (重複カウントしない)", () => {
    const user1: EngagementEntry[] = [
      makeEntry("feed-A", "like", 0),
      makeEntry("feed-A", "bookmark", 0),
      makeEntry("feed-A", "reading_list", 0),
    ];
    const result = aggregateGlobalTopFeeds([user1], 10, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].userCount).toBe(1);
    expect(result[0].totalScore).toBeCloseTo(11.0, 3); // 5 + 4 + 2
  });

  test("ai_feedback action はスコア対象外 (重み 0)", () => {
    const user1: EngagementEntry[] = [
      makeEntry("feed-A", "ai_feedback", 0),
      makeEntry("feed-A", "like", 0),
    ];
    const result = aggregateGlobalTopFeeds([user1], 10, NOW);
    expect(result[0].totalScore).toBeCloseTo(5.0, 3); // like のみカウント
  });

  test("now を引数化することで時間減衰を spec で固定可能", () => {
    const entries: EngagementEntry[][] = [[makeEntry("feed-A", "like", 7 * 24)]]; // 7 日前
    const result = aggregateGlobalTopFeeds(entries, 10, NOW);
    expect(result[0].totalScore).toBeCloseTo(2.5, 2); // 5.0 × 0.5 = 2.5
  });
});
