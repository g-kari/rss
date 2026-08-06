import { test, expect } from "@playwright/test";
import {
  shouldLoadMore,
  cooldownRemainingMs,
  DEFAULT_LOADMORE_COOLDOWN_MS,
} from "../src/lib/loadmore-cooldown";

/**
 * #773 案 A 実装: shouldLoadMore 純粋関数 spec (cooldown 1000ms ガード)。
 *
 * loadMore 発火後 N ms 間は次の loadMore を抑止する cooldown を導入。IO callback +
 * secondary cascade effect + 手動 loadMore() 全経路で この判定を経由させて scroll
 * 一気末尾移動 / 無限ロード を構造的に防ぐ。
 */
test.describe("shouldLoadMore", () => {
  test("lastLoadAt=0 (初回) は常に true", () => {
    expect(shouldLoadMore(0, 0)).toBe(true);
    expect(shouldLoadMore(1000, 0)).toBe(true);
    expect(shouldLoadMore(99999999, 0)).toBe(true);
  });

  test("cooldown 1000ms 経過後は true (境界値)", () => {
    expect(shouldLoadMore(2000, 1000, 1000)).toBe(true);
  });

  test("cooldown 999ms (1 ms 不足) は false", () => {
    expect(shouldLoadMore(1999, 1000, 1000)).toBe(false);
  });

  test("cooldown 中 (経過 0ms) は false", () => {
    expect(shouldLoadMore(1000, 1000, 1000)).toBe(false);
  });

  test("cooldown 大幅経過後は true", () => {
    expect(shouldLoadMore(10000, 1000, 1000)).toBe(true);
  });

  test("時計戻り (now < lastLoadAt) は safe fail-open で true", () => {
    expect(shouldLoadMore(500, 1000, 1000)).toBe(true);
    expect(shouldLoadMore(0, 5000, 1000)).toBe(true);
  });

  test("cooldownMs=0 (cooldown 無効) は常に true", () => {
    expect(shouldLoadMore(1000, 1000, 0)).toBe(true);
    expect(shouldLoadMore(1001, 1000, 0)).toBe(true);
  });

  test("デフォルト cooldownMs は DEFAULT_LOADMORE_COOLDOWN_MS (1000ms)", () => {
    expect(DEFAULT_LOADMORE_COOLDOWN_MS).toBe(1000);
    // デフォルト値での挙動: 999ms 経過は false、1000ms 経過は true
    expect(shouldLoadMore(1999, 1000)).toBe(false);
    expect(shouldLoadMore(2000, 1000)).toBe(true);
  });

  test("巨大な経過時間でも true (overflow 等で壊れない)", () => {
    expect(shouldLoadMore(Number.MAX_SAFE_INTEGER, 1000, 1000)).toBe(true);
  });

  test("cooldownMs=Infinity は時計戻り以外常に false", () => {
    expect(shouldLoadMore(1000, 1000, Infinity)).toBe(false);
    expect(shouldLoadMore(Number.MAX_SAFE_INTEGER, 1000, Infinity)).toBe(false);
    // 時計戻りは fail-open のため Infinity でも true
    expect(shouldLoadMore(500, 1000, Infinity)).toBe(true);
  });

  test("不正な時刻値は fail-open で true", () => {
    expect(shouldLoadMore(Number.NaN, 1000, 1000)).toBe(true);
    expect(shouldLoadMore(1000, Number.NaN, 1000)).toBe(true);
    expect(shouldLoadMore(Infinity, 1000, 1000)).toBe(true);
  });
});

/**
 * #1085 対応: cooldownRemainingMs 純粋関数 spec。
 *
 * secondary cascade effect (fill-viewport) が cooldown で抑止されたとき、残り cooldown 時間後に
 * retry をスケジュールするために残り時間を計算する。`shouldLoadMore(...) === (cooldownRemainingMs(...) === 0)`
 * の不変条件を保つことで #773 の burst 防止 (1000ms に最大 1 回) を壊さず deadlock を解消する。
 */
test.describe("cooldownRemainingMs", () => {
  test("lastLoadAt=0 (初回) は常に 0 (即許可)", () => {
    expect(cooldownRemainingMs(0, 0)).toBe(0);
    expect(cooldownRemainingMs(1000, 0)).toBe(0);
    expect(cooldownRemainingMs(99999999, 0)).toBe(0);
  });

  test("cooldown 満了後は 0 (境界値)", () => {
    expect(cooldownRemainingMs(2000, 1000, 1000)).toBe(0);
  });

  test("cooldown 中は残り ms を返す", () => {
    expect(cooldownRemainingMs(1999, 1000, 1000)).toBe(1); // 999ms 経過 → 残り 1ms
    expect(cooldownRemainingMs(1500, 1000, 1000)).toBe(500); // 500ms 経過 → 残り 500ms
    expect(cooldownRemainingMs(1000, 1000, 1000)).toBe(1000); // 0ms 経過 → 残り 1000ms
  });

  test("時計戻り (now < lastLoadAt) は 0 (fail-open)", () => {
    expect(cooldownRemainingMs(500, 1000, 1000)).toBe(0);
    expect(cooldownRemainingMs(0, 5000, 1000)).toBe(0);
  });

  test("cooldownMs=0 (cooldown 無効) は常に 0", () => {
    expect(cooldownRemainingMs(1000, 1000, 0)).toBe(0);
    expect(cooldownRemainingMs(1001, 1000, 0)).toBe(0);
  });

  test("不正な時刻値は 0 (即許可)", () => {
    expect(cooldownRemainingMs(Number.NaN, 1000, 1000)).toBe(0);
    expect(cooldownRemainingMs(1000, Number.NaN, 1000)).toBe(0);
    expect(cooldownRemainingMs(Infinity, 1000, 1000)).toBe(0);
  });

  test("デフォルト cooldownMs は DEFAULT_LOADMORE_COOLDOWN_MS (1000ms)", () => {
    expect(cooldownRemainingMs(1999, 1000)).toBe(1); // 999ms 経過
    expect(cooldownRemainingMs(2000, 1000)).toBe(0); // 1000ms 経過
  });

  test("shouldLoadMore と cooldownRemainingMs の不変条件 (===0 ⇔ true)", () => {
    const cases: ReadonlyArray<[number, number, number]> = [
      [0, 0, 1000],
      [2000, 1000, 1000],
      [1999, 1000, 1000],
      [1000, 1000, 1000],
      [500, 1000, 1000],
      [1000, 1000, 0],
      [1000, 1000, Infinity],
    ];
    for (const [now, lastLoadAt, cd] of cases) {
      expect(cooldownRemainingMs(now, lastLoadAt, cd) === 0).toBe(
        shouldLoadMore(now, lastLoadAt, cd),
      );
    }
  });
});
