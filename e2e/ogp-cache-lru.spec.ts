import { test, expect } from "@playwright/test";
import { mergeWithLruEviction } from "../src/lib/ogp-cache-lru";

/**
 * #1088 Finding 2: OGP cache eviction の true-LRU 化純粋関数 spec。
 * 旧 FIFO 実装 (`{ ...prev, [k]: e }` + `slice(-MAX)`) では再アクセスした古 entry が
 * 末尾移動せず誤って evict されていた。本 spec は recency 反映 + LRU eviction を固定する。
 */
test.describe("mergeWithLruEviction", () => {
  test("max 未満の新規 key は末尾に追加される", () => {
    const result = mergeWithLruEviction({ a: 1, b: 2 }, "c", 3, 5);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
    expect(Object.keys(result)).toEqual(["a", "b", "c"]);
  });

  test("既存 key の更新で値が反映され末尾へ移動する (recency 反映)", () => {
    const result = mergeWithLruEviction({ a: 1, b: 2, c: 3 }, "a", 99, 5);
    expect(result).toEqual({ b: 2, c: 3, a: 99 });
    // a が先頭から末尾へ移動 = 直近アクセスとして recency 反映
    expect(Object.keys(result)).toEqual(["b", "c", "a"]);
  });

  test("上限超過時は先頭 (最も古い) entry から evict する", () => {
    const result = mergeWithLruEviction({ a: 1, b: 2, c: 3 }, "d", 4, 3);
    // 4 件で max 3 → 先頭 a を evict、末尾 3 件を残す
    expect(result).toEqual({ b: 2, c: 3, d: 4 });
    expect(Object.keys(result)).toEqual(["b", "c", "d"]);
  });

  test("満杯状態で古 key を再アクセスすると LRU により生存する (FIFO 回帰防止)", () => {
    // max 3 で満杯。古い "a" を再アクセス (更新) → 末尾移動。
    const afterReaccess = mergeWithLruEviction({ a: 1, b: 2, c: 3 }, "a", 10, 3);
    expect(Object.keys(afterReaccess)).toEqual(["b", "c", "a"]);
    // 続けて新規 "d" を追加 → 先頭 "b" が evict され、再アクセス済の "a" は生存。
    // 旧 FIFO 実装では "a" が先頭固定のまま evict されていた。
    const afterAdd = mergeWithLruEviction(afterReaccess, "d", 11, 3);
    expect(afterAdd).toEqual({ c: 3, a: 10, d: 11 });
    expect(afterAdd).not.toHaveProperty("b");
    expect(afterAdd).toHaveProperty("a"); // 再アクセスで生存
  });

  test("max <= 0 は空オブジェクトを返す (slice(-0) 全件コピー罠の回避)", () => {
    expect(mergeWithLruEviction({ a: 1, b: 2 }, "c", 3, 0)).toEqual({});
    expect(mergeWithLruEviction({ a: 1 }, "b", 2, -1)).toEqual({});
  });

  test("入力 prev を mutate しない", () => {
    const prev = { a: 1, b: 2 };
    const result = mergeWithLruEviction(prev, "a", 99, 5);
    expect(prev).toEqual({ a: 1, b: 2 }); // 不変
    expect(result).not.toBe(prev);
  });

  test("object 値 (OgpCacheEntry 相当) でも動作する", () => {
    const prev = { x: { image: "img-x" }, y: { image: "img-y" } };
    const result = mergeWithLruEviction(prev, "x", { image: "img-x2" }, 5);
    expect(result).toEqual({ y: { image: "img-y" }, x: { image: "img-x2" } });
    expect(Object.keys(result)).toEqual(["y", "x"]);
  });
});
