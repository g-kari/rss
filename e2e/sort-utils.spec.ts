import { test, expect } from "@playwright/test";
import { sortByOrder } from "../src/lib/sort-utils";

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
