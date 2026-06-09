import { test, expect } from "@playwright/test";
import { scoreFeedEngagement, topScoredFeeds } from "../src/lib/engagement-score";
import type { EngagementEntry } from "../src/types";

/**
 * engagement-score.ts の単体テスト。
 *
 * scoreFeedEngagement — エンゲージメントスコア集計（アクション重み × 時間減衰）
 * topScoredFeeds — スコア上位フィードハッシュの抽出
 *
 * 時間を制御可能にするため scoreFeedEngagement の `now` パラメータを活用する。
 */

const NOW = new Date("2025-01-14T00:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_MS = 7 * DAY_MS; // 半減期 7 日

/** テスト用エントリを生成するヘルパー */
function entry(
  feedHash: string,
  action: EngagementEntry["action"],
  msAgo: number,
): EngagementEntry {
  return {
    articleId: `article_${feedHash}_${action}`,
    feedHash,
    action,
    timestamp: new Date(NOW - msAgo).toISOString(),
  };
}

// ==========================================================================
// scoreFeedEngagement
// ==========================================================================

test.describe("scoreFeedEngagement — 入力が空の場合", () => {
  test("エントリが空なら空の Map を返す", () => {
    const scores = scoreFeedEngagement([], NOW);
    expect(scores.size).toBe(0);
  });
});

test.describe("scoreFeedEngagement — アクション重みの検証", () => {
  // アクション直後（msAgo=0）は減衰 = 2^0 = 1.0 なので weight × 1.0 = weight そのもの

  test("like は重み 5.0 をスコアとして記録する", () => {
    const scores = scoreFeedEngagement([entry("feed1", "like", 0)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(5.0);
  });

  test("bookmark は重み 4.0 をスコアとして記録する", () => {
    const scores = scoreFeedEngagement([entry("feed1", "bookmark", 0)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(4.0);
  });

  test("fetch_full は重み 3.0 をスコアとして記録する", () => {
    const scores = scoreFeedEngagement([entry("feed1", "fetch_full", 0)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(3.0);
  });

  test("open_original は重み 2.5 をスコアとして記録する", () => {
    const scores = scoreFeedEngagement([entry("feed1", "open_original", 0)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(2.5);
  });

  test("reading_list は重み 2.0 をスコアとして記録する", () => {
    const scores = scoreFeedEngagement([entry("feed1", "reading_list", 0)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(2.0);
  });
});

test.describe("scoreFeedEngagement — 時間減衰の検証", () => {
  test("7 日前のエントリはスコアが半減する", () => {
    // 半減期 7 日 → decay = 0.5^(7日/7日) = 0.5
    const scores = scoreFeedEngagement([entry("feed1", "like", HALF_LIFE_MS)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(5.0 * 0.5, 5);
  });

  test("14 日前のエントリはスコアが 1/4 になる", () => {
    // decay = 0.5^(14日/7日) = 0.25
    const scores = scoreFeedEngagement([entry("feed1", "like", 2 * HALF_LIFE_MS)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(5.0 * 0.25, 5);
  });

  test("直後のエントリは減衰なし（decay ≈ 1.0）", () => {
    const scores = scoreFeedEngagement([entry("feed1", "like", 0)], NOW);
    expect(scores.get("feed1")).toBeCloseTo(5.0 * 1.0, 5);
  });

  test("古いエントリより新しいエントリの方がスコアが高い", () => {
    const recentScores = scoreFeedEngagement([entry("feed1", "like", DAY_MS)], NOW);
    const oldScores = scoreFeedEngagement([entry("feed1", "like", 30 * DAY_MS)], NOW);
    expect(recentScores.get("feed1")!).toBeGreaterThan(oldScores.get("feed1")!);
  });
});

test.describe("scoreFeedEngagement — 複数エントリの集計", () => {
  test("同じフィードへの複数アクションはスコアが加算される", () => {
    const entries = [
      entry("feed1", "like", 0), // 5.0
      entry("feed1", "bookmark", 0), // 4.0
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    expect(scores.get("feed1")).toBeCloseTo(9.0);
  });

  test("異なるフィードのスコアは独立して計算される", () => {
    const entries = [entry("feed1", "like", 0), entry("feed2", "bookmark", 0)];
    const scores = scoreFeedEngagement(entries, NOW);
    expect(scores.get("feed1")).toBeCloseTo(5.0);
    expect(scores.get("feed2")).toBeCloseTo(4.0);
  });

  test("同一フィードへの同一アクションを複数回記録すると加算される", () => {
    const entries = [
      entry("feed1", "like", 0),
      entry("feed1", "like", 0),
      entry("feed1", "like", 0),
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    expect(scores.get("feed1")).toBeCloseTo(15.0);
  });

  test("複数フィードの Map を正しく返す", () => {
    const entries = [
      entry("feedA", "like", 0),
      entry("feedB", "bookmark", 0),
      entry("feedC", "reading_list", 0),
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    expect(scores.size).toBe(3);
    expect(scores.has("feedA")).toBe(true);
    expect(scores.has("feedB")).toBe(true);
    expect(scores.has("feedC")).toBe(true);
  });
});

test.describe("scoreFeedEngagement — now パラメータ", () => {
  test("now を省略すると Date.now() が使用される（エラーなし）", () => {
    const entries = [
      {
        articleId: "a1",
        feedHash: "feedX",
        action: "like" as const,
        timestamp: new Date().toISOString(),
      },
    ];
    // エラーなく実行できれば OK
    expect(() => scoreFeedEngagement(entries)).not.toThrow();
    const scores = scoreFeedEngagement(entries);
    expect(scores.has("feedX")).toBe(true);
  });
});

// ==========================================================================
// topScoredFeeds
// ==========================================================================

test.describe("topScoredFeeds — 入力が空の場合", () => {
  test("空の Map は空配列を返す", () => {
    const result = topScoredFeeds(new Map(), 10);
    expect(result).toEqual([]);
  });
});

test.describe("topScoredFeeds — ソート順", () => {
  test("スコア降順で返す", () => {
    const scores = new Map([
      ["low", 1.0],
      ["high", 5.0],
      ["mid", 3.0],
    ]);
    const result = topScoredFeeds(scores, 10);
    expect(result).toEqual(["high", "mid", "low"]);
  });

  test("同スコアのフィードも含めて返す", () => {
    const scores = new Map([
      ["feed1", 3.0],
      ["feed2", 3.0],
    ]);
    const result = topScoredFeeds(scores, 10);
    expect(result).toHaveLength(2);
  });
});

test.describe("topScoredFeeds — limit パラメータ", () => {
  test("limit=1 なら上位 1 件のみ返す", () => {
    const scores = new Map([
      ["best", 10.0],
      ["second", 7.0],
      ["third", 3.0],
    ]);
    const result = topScoredFeeds(scores, 1);
    expect(result).toEqual(["best"]);
  });

  test("limit がエントリ数より多い場合は全件返す", () => {
    const scores = new Map([
      ["feed1", 5.0],
      ["feed2", 3.0],
    ]);
    const result = topScoredFeeds(scores, 100);
    expect(result).toHaveLength(2);
  });

  test("limit=0 なら空配列を返す", () => {
    const scores = new Map([["feed1", 5.0]]);
    const result = topScoredFeeds(scores, 0);
    expect(result).toEqual([]);
  });
});

test.describe("topScoredFeeds — minScore フィルタリング", () => {
  test("デフォルト minScore=0.1 未満のフィードは除外される", () => {
    const scores = new Map([
      ["above", 0.2],
      ["below", 0.05],
    ]);
    const result = topScoredFeeds(scores, 10);
    expect(result).toContain("above");
    expect(result).not.toContain("below");
  });

  test("minScore 以上のフィードは含まれる", () => {
    const scores = new Map([["exact", 0.1]]);
    const result = topScoredFeeds(scores, 10);
    expect(result).toContain("exact");
  });

  test("カスタム minScore=1.0 で低スコアを除外できる", () => {
    const scores = new Map([
      ["high", 2.0],
      ["low", 0.5],
    ]);
    const result = topScoredFeeds(scores, 10, 1.0);
    expect(result).toContain("high");
    expect(result).not.toContain("low");
  });

  test("minScore=0 なら全フィードを対象とする", () => {
    const scores = new Map([
      ["zero_ish", 0.001],
      ["normal", 5.0],
    ]);
    const result = topScoredFeeds(scores, 10, 0);
    expect(result).toHaveLength(2);
  });

  test("全フィードが minScore 未満なら空配列を返す", () => {
    const scores = new Map([
      ["feed1", 0.01],
      ["feed2", 0.05],
    ]);
    const result = topScoredFeeds(scores, 10, 0.1);
    expect(result).toEqual([]);
  });
});

test.describe("topScoredFeeds — 統合: scoreFeedEngagement との連携", () => {
  test("エンゲージメントが多いフィードが上位に来る", () => {
    const entries: EngagementEntry[] = [
      // feedA: like × 3 = 15.0
      entry("feedA", "like", 0),
      entry("feedA", "like", 0),
      entry("feedA", "like", 0),
      // feedB: bookmark × 1 = 4.0
      entry("feedB", "bookmark", 0),
      // feedC: reading_list × 1 = 2.0
      entry("feedC", "reading_list", 0),
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    const top = topScoredFeeds(scores, 3);
    expect(top[0]).toBe("feedA");
    expect(top[1]).toBe("feedB");
    expect(top[2]).toBe("feedC");
  });

  test("時間減衰により古いエントリのフィードは順位が下がる", () => {
    const entries: EngagementEntry[] = [
      // feedOld: 30 日前の like → 大幅減衰
      entry("feedOld", "like", 30 * DAY_MS),
      // feedNew: 直後の bookmark
      entry("feedNew", "bookmark", 0),
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    const top = topScoredFeeds(scores, 2);
    // feedNew (4.0 × ~1.0 ≈ 4.0) > feedOld (5.0 × 2^(-30/7) ≈ 0.35)
    expect(top[0]).toBe("feedNew");
  });
});

test.describe("timeDecay 防御 — 不正 / 未来 timestamp (#timedecay-guard)", () => {
  test("不正 timestamp の entry は score 0 (NaN を伝播しない)", () => {
    const entries: EngagementEntry[] = [
      { articleId: "a1", feedHash: "feedBad", action: "like", timestamp: "not-a-date" },
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    expect(scores.get("feedBad") ?? 0).toBe(0);
    expect(Number.isNaN(scores.get("feedBad") ?? 0)).toBe(false);
  });

  test("正常 + 不正 timestamp 混在 feed は正常分のみ集計される (NaN 合計で脱落しない)", () => {
    const entries: EngagementEntry[] = [
      entry("feedMix", "like", 0), // 正常 (decay ≈ 1.0 → 5.0)
      { articleId: "a2", feedHash: "feedMix", action: "bookmark", timestamp: "" }, // 不正 → 0
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    const s = scores.get("feedMix") ?? NaN;
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeCloseTo(5.0, 1); // 正常 like 分のみ
  });

  test("未来 timestamp (時計戻り) は decay を 1.0 に clamp し増幅しない", () => {
    const entries: EngagementEntry[] = [
      {
        articleId: "a3",
        feedHash: "feedFuture",
        action: "like",
        timestamp: new Date(NOW + 30 * DAY_MS).toISOString(),
      },
    ];
    const scores = scoreFeedEngagement(entries, NOW);
    const s = scores.get("feedFuture") ?? NaN;
    // decay <= 1.0 にクランプ → 5.0 (weight) を超えない
    expect(s).toBeLessThanOrEqual(5.0);
    expect(s).toBeCloseTo(5.0, 1);
  });
});
