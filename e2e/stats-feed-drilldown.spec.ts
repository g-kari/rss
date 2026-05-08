import { test, expect } from "@playwright/test";
import { aggregateStatsForFeed } from "../src/lib/stats-helpers";
import type { EngagementEntry } from "../src/types";

function entry(overrides: Partial<EngagementEntry>): EngagementEntry {
  return {
    articleId: "a1",
    feedHash: "feed-A",
    action: "fetch_full",
    timestamp: "2026-05-08T10:00:00.000Z",
    ...overrides,
  };
}

test.describe("aggregateStatsForFeed — 基本動作", () => {
  test("空配列なら weeklyTotal=0、daily/yearly は全 0", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const result = aggregateStatsForFeed([], "feed-A", now);

    expect(result.weeklyTotal).toBe(0);
    expect(result.dailyReadCounts).toHaveLength(7);
    expect(result.dailyReadCounts.every((d) => d.count === 0)).toBe(true);
    expect(result.yearlyHeatmap).toHaveLength(365);
    expect(result.yearlyHeatmap.every((d) => d.count === 0)).toBe(true);
  });

  test("対象 feedHash のエントリのみ集計される", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ feedHash: "feed-A", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ feedHash: "feed-B", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ feedHash: "feed-A", timestamp: "2026-05-07T10:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);

    expect(result.weeklyTotal).toBe(2);
  });
});

test.describe("aggregateStatsForFeed — READ_ACTIONS のみカウント", () => {
  test("fetch_full / open_original のみがカウント対象", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ action: "fetch_full", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ action: "open_original", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ action: "bookmark", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ action: "like", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ action: "reading_list", timestamp: "2026-05-08T10:00:00.000Z" }),
      entry({ action: "ai_feedback", timestamp: "2026-05-08T10:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);
    expect(result.weeklyTotal).toBe(2);

    // 当日 (now=2026-05-08) は dailyReadCounts の最後尾
    const today = result.dailyReadCounts[result.dailyReadCounts.length - 1]!;
    expect(today.date).toBe("2026-05-08");
    expect(today.count).toBe(2);
  });
});

test.describe("aggregateStatsForFeed — dailyReadCounts (7日)", () => {
  test("7 日分のリストが昇順で返る（末尾が today）", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const result = aggregateStatsForFeed([], "feed-A", now);

    expect(result.dailyReadCounts).toHaveLength(7);
    expect(result.dailyReadCounts[6]!.date).toBe("2026-05-08");
    expect(result.dailyReadCounts[0]!.date).toBe("2026-05-02");
  });

  test("各日のカウントが正しく集計される", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ timestamp: "2026-05-08T01:00:00.000Z" }),
      entry({ timestamp: "2026-05-08T15:00:00.000Z" }),
      entry({ timestamp: "2026-05-07T08:00:00.000Z" }),
      entry({ timestamp: "2026-05-02T08:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);
    const counts = Object.fromEntries(result.dailyReadCounts.map((d) => [d.date, d.count]));

    expect(counts["2026-05-08"]).toBe(2);
    expect(counts["2026-05-07"]).toBe(1);
    expect(counts["2026-05-02"]).toBe(1);
  });

  test("7 日より古いエントリは dailyReadCounts に含まれない", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ timestamp: "2026-05-01T08:00:00.000Z" }), // 7 日前より古い
      entry({ timestamp: "2026-05-08T08:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);
    const total = result.dailyReadCounts.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(1);
  });
});

test.describe("aggregateStatsForFeed — yearlyHeatmap (365日)", () => {
  test("365 日分のリストが昇順で返る", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const result = aggregateStatsForFeed([], "feed-A", now);

    expect(result.yearlyHeatmap).toHaveLength(365);
    expect(result.yearlyHeatmap[364]!.date).toBe("2026-05-08");
  });

  test("365 日以内のエントリは yearlyHeatmap に含まれる", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ timestamp: "2025-08-01T08:00:00.000Z" }),
      entry({ timestamp: "2026-05-08T08:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);
    const total = result.yearlyHeatmap.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(2);
  });
});

test.describe("aggregateStatsForFeed — weeklyTotal", () => {
  test("月曜以降のエントリだけカウント", () => {
    // 2026-05-08 は金曜。週始まり (UTC 月曜) は 2026-05-04
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ timestamp: "2026-05-04T00:00:00.000Z" }), // 月曜 0:00
      entry({ timestamp: "2026-05-05T08:00:00.000Z" }),
      entry({ timestamp: "2026-05-03T23:59:59.000Z" }), // 日曜 → 先週
      entry({ timestamp: "2026-05-08T08:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);
    expect(result.weeklyTotal).toBe(3);
  });
});

test.describe("aggregateStatsForFeed — フィード絞り込み", () => {
  test("他フィードのエントリは weeklyTotal にも daily にも yearly にも含まれない", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const entries: EngagementEntry[] = [
      entry({ feedHash: "feed-A", timestamp: "2026-05-08T08:00:00.000Z" }),
      entry({ feedHash: "feed-B", timestamp: "2026-05-08T08:00:00.000Z" }),
      entry({ feedHash: "feed-B", timestamp: "2026-05-07T08:00:00.000Z" }),
      entry({ feedHash: "feed-B", timestamp: "2025-12-01T08:00:00.000Z" }),
    ];

    const result = aggregateStatsForFeed(entries, "feed-A", now);
    expect(result.weeklyTotal).toBe(1);
    expect(result.dailyReadCounts.reduce((s, d) => s + d.count, 0)).toBe(1);
    expect(result.yearlyHeatmap.reduce((s, d) => s + d.count, 0)).toBe(1);
  });
});
