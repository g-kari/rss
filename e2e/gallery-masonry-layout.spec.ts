import { test, expect } from "@playwright/test";
import {
  computeColumnHeights,
  assignItemToShortestColumn,
  type MasonryLayoutItem,
} from "../src/lib/gallery-masonry-layout";

/**
 * #773 Phase 0: 自前 masonry layout の基盤型 + 純粋関数 spec。
 *
 * `masonic` 廃止 + 自前 virtualizer 実装の Phase 0 として、列累積高さ計算と
 * 最短列選択ロジックを TDD で固定する。Phase 1 (`computeMasonryLayout`) と
 * Phase 2 (UI 統合) は本 spec の挙動を前提に構築される。
 */

function item(id: string, height: number, width: number = 100): MasonryLayoutItem {
  return { id, width, height };
}

test.describe("assignItemToShortestColumn — 最短列選択", () => {
  test("空配列 → defensive で 0 を返す", () => {
    expect(assignItemToShortestColumn([])).toBe(0);
  });

  test("単一列 → 常に 0", () => {
    expect(assignItemToShortestColumn([100])).toBe(0);
    expect(assignItemToShortestColumn([0])).toBe(0);
  });

  test("複数列で明確な最短列 → 最短列 index", () => {
    expect(assignItemToShortestColumn([100, 200, 150])).toBe(0);
    expect(assignItemToShortestColumn([300, 100, 200])).toBe(1);
    expect(assignItemToShortestColumn([200, 300, 100])).toBe(2);
  });

  test("tie (複数列が同高さ) → 最小 index を返す (決定論的)", () => {
    expect(assignItemToShortestColumn([100, 100, 200])).toBe(0);
    expect(assignItemToShortestColumn([200, 100, 100])).toBe(1);
    expect(assignItemToShortestColumn([100, 100, 100])).toBe(0);
  });
});

test.describe("computeColumnHeights — 列ごとの累積高さ計算", () => {
  test("空 items → 全列 0", () => {
    expect(computeColumnHeights([], 3)).toEqual([0, 0, 0]);
  });

  test("columnCount < 1 → 空配列 (defensive)", () => {
    expect(computeColumnHeights([item("a", 100)], 0)).toEqual([]);
    expect(computeColumnHeights([item("a", 100)], -1)).toEqual([]);
  });

  test("1 列 + 1 item → [item.height]", () => {
    expect(computeColumnHeights([item("a", 100)], 1)).toEqual([100]);
  });

  test("1 列 + 複数 items (gap=0) → 累積", () => {
    expect(computeColumnHeights([item("a", 100), item("b", 200), item("c", 50)], 1)).toEqual([350]);
  });

  test("1 列 + 複数 items + gap=10 → gap 込み累積 (2 番目以降のみ加算)", () => {
    // 100 + (gap 10 + 200) + (gap 10 + 50) = 370
    expect(computeColumnHeights([item("a", 100), item("b", 200), item("c", 50)], 1, 10)).toEqual([
      370,
    ]);
  });

  test("3 列 + 1 item → 最初の列に配置 [100, 0, 0]", () => {
    expect(computeColumnHeights([item("a", 100)], 3)).toEqual([100, 0, 0]);
  });

  test("3 列 + 3 items (同高) → 各列に 1 item ずつ [h, h, h] (tie 時最小 index)", () => {
    expect(computeColumnHeights([item("a", 100), item("b", 100), item("c", 100)], 3)).toEqual([
      100, 100, 100,
    ]);
  });

  test("3 列 + 4 items (同高) → 4 番目は col 0 へ [200, 100, 100]", () => {
    expect(
      computeColumnHeights([item("a", 100), item("b", 100), item("c", 100), item("d", 100)], 3),
    ).toEqual([200, 100, 100]);
  });

  test("3 列 + 不均等高さ items → 最短列に順次追加", () => {
    // a:100 → col 0 [100, 0, 0]
    // b:200 → col 1 (tie min) [100, 200, 0]
    // c:50  → col 2 [100, 200, 50]
    // d:300 → col 2 (50 が最短) [100, 200, 350]
    expect(
      computeColumnHeights([item("a", 100), item("b", 200), item("c", 50), item("d", 300)], 3),
    ).toEqual([100, 200, 350]);
  });

  test("3 列 + 5 items + gap=20 → 配置順 + gap 累積", () => {
    // a:100 → col 0 [100, 0, 0]
    // b:200 → col 1 [100, 200, 0]
    // c:50  → col 2 [100, 200, 50]
    // d:80  → col 2 (50 が最短) [100, 200, 50 + 20 + 80 = 150]
    // e:120 → col 0 (100 が最短) [100 + 20 + 120 = 240, 200, 150]
    expect(
      computeColumnHeights(
        [item("a", 100), item("b", 200), item("c", 50), item("d", 80), item("e", 120)],
        3,
        20,
      ),
    ).toEqual([240, 200, 150]);
  });

  test("3 列 + 同高 2 items → 残列は 0 のまま [h, h, 0]", () => {
    expect(computeColumnHeights([item("a", 100), item("b", 100)], 3)).toEqual([100, 100, 0]);
  });

  test("配置順序が決定論的: 同入力で常に同結果", () => {
    const items = [item("a", 100), item("b", 100), item("c", 100)];
    const result1 = computeColumnHeights(items, 3);
    const result2 = computeColumnHeights(items, 3);
    expect(result1).toEqual(result2);
    expect(result1).toEqual([100, 100, 100]);
  });
});
