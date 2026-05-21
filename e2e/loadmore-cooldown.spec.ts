import { test, expect } from "@playwright/test";
import { shouldLoadMore, DEFAULT_LOADMORE_COOLDOWN_MS } from "../src/lib/loadmore-cooldown";

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
});
