import { test, expect } from "@playwright/test";
import { equalUnreadByFeed, equalLastPublishedByFeed } from "../src/lib/unread-stats-merge";

/**
 * `equalUnreadByFeed` / `equalLastPublishedByFeed` 純粋関数の spec (#758)。
 *
 * `react-state-ref.md` の「state 更新前に構造的等価性ガードを入れて reference を
 * 安定化する」規範に従い、`useArticleUnreadStats` の Map state が内容変化なしの
 * ときに前回 reference を返せるよう、Map の structural equality 判定を提供する。
 *
 * `equalSnoozedUntil` (`read-state-merge.ts`) と同パターン。
 */

test.describe("equalUnreadByFeed", () => {
  test("同一 reference は true", () => {
    const m = new Map<string, number>([["a", 1]]);
    expect(equalUnreadByFeed(m, m)).toBe(true);
  });

  test("両方空 Map は true", () => {
    expect(equalUnreadByFeed(new Map(), new Map())).toBe(true);
  });

  test("同一 size + 全 key/value 一致は true", () => {
    const a = new Map([
      ["feed1", 3],
      ["feed2", 5],
    ]);
    const b = new Map([
      ["feed1", 3],
      ["feed2", 5],
    ]);
    expect(equalUnreadByFeed(a, b)).toBe(true);
  });

  test("挿入順序が違っても全 key/value 一致なら true", () => {
    const a = new Map([
      ["feed1", 3],
      ["feed2", 5],
    ]);
    const b = new Map([
      ["feed2", 5],
      ["feed1", 3],
    ]);
    expect(equalUnreadByFeed(a, b)).toBe(true);
  });

  test("size 異なるなら false", () => {
    const a = new Map([["feed1", 3]]);
    const b = new Map([
      ["feed1", 3],
      ["feed2", 5],
    ]);
    expect(equalUnreadByFeed(a, b)).toBe(false);
  });

  test("同 size + 同 keys + 値が異なるなら false", () => {
    const a = new Map([["feed1", 3]]);
    const b = new Map([["feed1", 4]]);
    expect(equalUnreadByFeed(a, b)).toBe(false);
  });

  test("同 size + key 集合が異なるなら false", () => {
    const a = new Map([["feed1", 3]]);
    const b = new Map([["feed2", 3]]);
    expect(equalUnreadByFeed(a, b)).toBe(false);
  });

  test("一方が空 + 他方が 1 件なら false", () => {
    expect(equalUnreadByFeed(new Map(), new Map([["feed1", 1]]))).toBe(false);
    expect(equalUnreadByFeed(new Map([["feed1", 1]]), new Map())).toBe(false);
  });

  test("100 件で全一致は true (perf sanity)", () => {
    const a = new Map<string, number>();
    const b = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      a.set(`feed${i}`, i);
      b.set(`feed${i}`, i);
    }
    expect(equalUnreadByFeed(a, b)).toBe(true);
  });
});

test.describe("equalLastPublishedByFeed", () => {
  test("同一 reference は true", () => {
    const m = new Map<string, string>([["a", "2026-01-01T00:00:00Z"]]);
    expect(equalLastPublishedByFeed(m, m)).toBe(true);
  });

  test("両方空 Map は true", () => {
    expect(equalLastPublishedByFeed(new Map(), new Map())).toBe(true);
  });

  test("同一 size + 全 key/value 一致は true (string value)", () => {
    const a = new Map([
      ["feed1", "2026-05-01T00:00:00Z"],
      ["feed2", "2026-05-02T00:00:00Z"],
    ]);
    const b = new Map([
      ["feed1", "2026-05-01T00:00:00Z"],
      ["feed2", "2026-05-02T00:00:00Z"],
    ]);
    expect(equalLastPublishedByFeed(a, b)).toBe(true);
  });

  test("値の文字列が違うなら false", () => {
    const a = new Map([["feed1", "2026-05-01T00:00:00Z"]]);
    const b = new Map([["feed1", "2026-05-02T00:00:00Z"]]);
    expect(equalLastPublishedByFeed(a, b)).toBe(false);
  });

  test("size 異なるなら false", () => {
    expect(
      equalLastPublishedByFeed(
        new Map([["feed1", "2026-05-01T00:00:00Z"]]),
        new Map([
          ["feed1", "2026-05-01T00:00:00Z"],
          ["feed2", "2026-05-02T00:00:00Z"],
        ]),
      ),
    ).toBe(false);
  });
});
