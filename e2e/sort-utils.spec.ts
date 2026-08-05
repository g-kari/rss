import { test, expect } from "@playwright/test";
import {
  COLLECTION_SORT_BY_CYCLE,
  COLLECTION_SORT_BY_LABELS,
  sortByOrder,
  sortCollectionsBy,
} from "../src/lib/sort-utils";
import type { Collection, CollectionSortBy } from "../src/types";

/**
 * `sortByOrder` 純粋関数のテスト。
 *
 * `useFeedGroups` / `useCollections` で重複していた sort ロジックの集約。
 */

test.describe("sortByOrder — 基本", () => {
  test("order 昇順でソートする", () => {
    const items = [
      { id: "a", order: 3 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
    ];
    const sorted = sortByOrder(items);
    expect(sorted.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  test("元の配列を mutate しない", () => {
    const items = [
      { id: "a", order: 3 },
      { id: "b", order: 1 },
    ];
    const original = [...items];
    sortByOrder(items);
    expect(items).toEqual(original);
  });

  test("空配列を渡すと空配列を返す", () => {
    expect(sortByOrder([])).toEqual([]);
  });

  test("1 要素配列はそのまま返す", () => {
    const items = [{ id: "a", order: 5 }];
    expect(sortByOrder(items)).toEqual([{ id: "a", order: 5 }]);
  });

  test("負の order 値も正しくソートする", () => {
    const items = [
      { id: "a", order: 1 },
      { id: "b", order: -2 },
      { id: "c", order: 0 },
    ];
    const sorted = sortByOrder(items);
    expect(sorted.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  test("同じ order 値の場合は元の順序を保持 (stable sort)", () => {
    const items = [
      { id: "a", order: 1 },
      { id: "b", order: 1 },
      { id: "c", order: 1 },
    ];
    const sorted = sortByOrder(items);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

test.describe("sortByOrder — 型互換", () => {
  test("追加プロパティを持つオブジェクトでも動く (FeedGroup 互換)", () => {
    interface FeedGroup {
      id: string;
      name: string;
      order: number;
      collapsed: boolean;
    }
    const groups: FeedGroup[] = [
      { id: "1", name: "B", order: 2, collapsed: false },
      { id: "2", name: "A", order: 1, collapsed: true },
    ];
    const sorted = sortByOrder(groups);
    expect(sorted[0].name).toBe("A");
    expect(sorted[0].collapsed).toBe(true);
    expect(sorted[1].name).toBe("B");
  });

  test("readonly 配列も受け付ける", () => {
    const items: ReadonlyArray<{ id: string; order: number }> = [
      { id: "x", order: 2 },
      { id: "y", order: 1 },
    ];
    const sorted = sortByOrder(items);
    expect(sorted.map((i) => i.id)).toEqual(["y", "x"]);
  });
});

test.describe("sortCollectionsBy (#874 候補 1)", () => {
  const make = (id: string, overrides: Partial<Collection> = {}): Collection => ({
    id,
    name: `Collection ${id}`,
    articleIds: [],
    createdAt: "2024-01-01T00:00:00Z",
    order: 0,
    ...overrides,
  });

  test("sortBy=order は order 昇順 (sortByOrder と同等)", () => {
    const items = [make("a", { order: 3 }), make("b", { order: 1 }), make("c", { order: 2 })];
    expect(sortCollectionsBy(items, "order").map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  test("sortBy=createdAtDesc は作成日 新→旧", () => {
    const items = [
      make("oldest", { createdAt: "2024-01-01T00:00:00Z" }),
      make("newest", { createdAt: "2024-06-01T00:00:00Z" }),
      make("middle", { createdAt: "2024-03-15T00:00:00Z" }),
    ];
    expect(sortCollectionsBy(items, "createdAtDesc").map((c) => c.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  test("sortBy=createdAtDesc で tz 形式違いの同時刻を絶対時刻ベースで判定", () => {
    const items = [
      make("zulu", { createdAt: "2024-06-01T00:00:00Z" }),
      make("offset", { createdAt: "2024-06-01T09:00:00+09:00" }), // 同 instant
    ];
    // 同 instant なので順序保持 (Array.sort stable)
    const result = sortCollectionsBy(items, "createdAtDesc").map((c) => c.id);
    expect(result).toEqual(["zulu", "offset"]);
  });

  test("sortBy=createdAtDesc で不正な日時は末尾に送る", () => {
    const items = [
      make("invalid", { createdAt: "not-a-date" }),
      make("valid", { createdAt: "2024-06-01T00:00:00Z" }),
    ];
    expect(sortCollectionsBy(items, "createdAtDesc").map((c) => c.id)).toEqual([
      "valid",
      "invalid",
    ]);
  });

  test("sortBy=articleCountDesc は記事数 多→少", () => {
    const items = [
      make("few", { articleIds: ["a"] }),
      make("many", { articleIds: ["a", "b", "c", "d"] }),
      make("medium", { articleIds: ["a", "b"] }),
    ];
    expect(sortCollectionsBy(items, "articleCountDesc").map((c) => c.id)).toEqual([
      "many",
      "medium",
      "few",
    ]);
  });

  test("sortBy=articleCountDesc で同記事数は order 昇順 fallback", () => {
    const items = [
      make("b", { articleIds: ["x"], order: 2 }),
      make("a", { articleIds: ["x"], order: 1 }),
    ];
    expect(sortCollectionsBy(items, "articleCountDesc").map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("sortBy=nameAsc は名前 localeCompare (日本語含む)", () => {
    const items = [
      make("c", { name: "らくがき" }),
      make("a", { name: "あいうえお" }),
      make("b", { name: "技術" }),
    ];
    const result = sortCollectionsBy(items, "nameAsc").map((c) => c.name);
    // localeCompare の規範: あ < ら, 漢字は環境依存
    expect(result[0]).toBe("あいうえお");
  });

  test("sortBy=nameDesc は名前 localeCompare の逆順", () => {
    const items = [
      make("a", { name: "Alpha" }),
      make("z", { name: "Zebra" }),
      make("m", { name: "Middle" }),
    ];
    expect(sortCollectionsBy(items, "nameDesc").map((c) => c.name)).toEqual([
      "Zebra",
      "Middle",
      "Alpha",
    ]);
  });

  test("元の配列を mutate しない", () => {
    const items = [make("a", { order: 3 }), make("b", { order: 1 })];
    const before = [...items];
    sortCollectionsBy(items, "order");
    expect(items).toEqual(before);
  });

  test("空配列を渡すと空配列を返す", () => {
    expect(sortCollectionsBy([], "createdAtDesc")).toEqual([]);
  });

  test("不明な sortBy 値は order 昇順 fallback (default 動作)", () => {
    const items = [make("a", { order: 3 }), make("b", { order: 1 })];
    // runtime で想定外文字列が来ても order fallback (defensive)
    const result = sortCollectionsBy(items, "unknown" as CollectionSortBy);
    expect(result.map((c) => c.id)).toEqual(["b", "a"]);
  });

  test("COLLECTION_SORT_BY_CYCLE は 5 軸を含む", () => {
    expect(COLLECTION_SORT_BY_CYCLE).toEqual([
      "order",
      "createdAtDesc",
      "articleCountDesc",
      "nameAsc",
      "nameDesc",
    ]);
  });

  test("COLLECTION_SORT_BY_LABELS は全 cycle 値にラベル定義あり", () => {
    for (const v of COLLECTION_SORT_BY_CYCLE) {
      expect(COLLECTION_SORT_BY_LABELS[v]).toBeTruthy();
    }
  });
});
