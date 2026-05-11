import { test, expect } from "@playwright/test";
import {
  isOffViewport,
  computeLastVisibleIndex,
  partitionByViewport,
} from "../src/lib/gallery-offviewport";

/**
 * #714 Phase 1: ギャラリーレイアウト (masonic) で「viewport より下にある item のみ
 * 再配置 (positioner.update) する」設計のための純粋関数。
 *
 * 設計方針 (ユーザー判断「案 A + 画面領域外のみ適応」):
 * - 画像 load で item の actual height 判明
 * - viewport 内 (visible) の item は触らない (ちらつき防止)
 * - viewport 外 (off-screen) の item のみ positioner に通知して再配置
 *
 * Phase 2 で `GalleryMasonry.tsx` から呼び出す UI 統合は別サイクル。
 */

// ── isOffViewport ───────────────────────────────────────────────

test.describe("isOffViewport", () => {
  test("lastVisibleIndex より大きい index は viewport 外と判定", () => {
    expect(isOffViewport(10, 5)).toBe(true);
  });

  test("lastVisibleIndex と同じ index は viewport 内 (= 触らない)", () => {
    expect(isOffViewport(5, 5)).toBe(false);
  });

  test("lastVisibleIndex より小さい index は viewport 内", () => {
    expect(isOffViewport(0, 5)).toBe(false);
  });

  test("lastVisibleIndex = -1 (= 全 item が viewport 外) のとき index 0 でも off-viewport", () => {
    expect(isOffViewport(0, -1)).toBe(true);
  });

  test("lastVisibleIndex が items.length - 1 のとき全 item viewport 内", () => {
    // 例: items.length = 100, lastVisibleIndex = 99 → 全 item が viewport 内
    expect(isOffViewport(99, 99)).toBe(false);
    expect(isOffViewport(50, 99)).toBe(false);
    expect(isOffViewport(0, 99)).toBe(false);
  });
});

// ── computeLastVisibleIndex ─────────────────────────────────────

test.describe("computeLastVisibleIndex", () => {
  test("空配列なら -1 を返す (viewport 内 item なし)", () => {
    expect(computeLastVisibleIndex([], 0, 800)).toBe(-1);
  });

  test("全 item が viewport 内 (item の top < viewport bottom)", () => {
    const positions = [
      { index: 0, top: 0 },
      { index: 1, top: 100 },
      { index: 2, top: 200 },
    ];
    // scrollTop=0, viewportHeight=800 → viewportBottom=800、全 top<800
    expect(computeLastVisibleIndex(positions, 0, 800)).toBe(2);
  });

  test("最後の item が viewport より下にある場合、その直前まで返す", () => {
    const positions = [
      { index: 0, top: 0 },
      { index: 1, top: 100 },
      { index: 2, top: 200 },
      { index: 3, top: 900 }, // viewportBottom=800 より下 → 不可視
    ];
    expect(computeLastVisibleIndex(positions, 0, 800)).toBe(2);
  });

  test("scrollTop で viewport がずれる (下にスクロールした状態)", () => {
    const positions = [
      { index: 0, top: 0 }, // 0 < 0 + 800 = 800: 範囲内 (top < bottom)
      { index: 1, top: 500 }, // 500 < 800: 範囲内
      { index: 2, top: 1500 }, // 1500 >= 800: 範囲外
    ];
    // scrollTop=0 → viewportBottom=800
    expect(computeLastVisibleIndex(positions, 0, 800)).toBe(1);

    // scrollTop=1000 → viewportBottom=1800 → index 2 も範囲内
    expect(computeLastVisibleIndex(positions, 1000, 800)).toBe(2);
  });

  test("position 配列が index 昇順でない場合でも最大の visible index を返す", () => {
    const positions = [
      { index: 5, top: 100 },
      { index: 2, top: 50 },
      { index: 8, top: 300 },
      { index: 0, top: 0 },
    ];
    // 全 top < 800 → max index = 8
    expect(computeLastVisibleIndex(positions, 0, 800)).toBe(8);
  });

  test("viewport 内に 1 item しか無い場合", () => {
    const positions = [
      { index: 0, top: 0 },
      { index: 1, top: 900 },
      { index: 2, top: 1800 },
    ];
    expect(computeLastVisibleIndex(positions, 0, 800)).toBe(0);
  });

  test("全 item が viewport より下 (= 全 off-viewport) なら -1", () => {
    const positions = [
      { index: 0, top: 1000 },
      { index: 1, top: 2000 },
    ];
    expect(computeLastVisibleIndex(positions, 0, 800)).toBe(-1);
  });
});

// ── partitionByViewport ─────────────────────────────────────────

test.describe("partitionByViewport", () => {
  test("inside / outside に正しく分割する", () => {
    type Item = { idx: number };
    const items: Item[] = [{ idx: 0 }, { idx: 1 }, { idx: 5 }, { idx: 10 }];
    const result = partitionByViewport(items, (i) => i.idx, 3);
    expect(result.inside.map((i) => i.idx)).toEqual([0, 1]);
    expect(result.outside.map((i) => i.idx)).toEqual([5, 10]);
  });

  test("lastVisibleIndex = -1 のとき全 item が outside", () => {
    type Item = { idx: number };
    const items: Item[] = [{ idx: 0 }, { idx: 1 }, { idx: 2 }];
    const result = partitionByViewport(items, (i) => i.idx, -1);
    expect(result.inside).toEqual([]);
    expect(result.outside.map((i) => i.idx)).toEqual([0, 1, 2]);
  });

  test("空配列なら inside / outside ともに空", () => {
    const result = partitionByViewport<{ idx: number }>([], (i) => i.idx, 5);
    expect(result.inside).toEqual([]);
    expect(result.outside).toEqual([]);
  });

  test("全 item が viewport 内の場合 outside は空", () => {
    type Item = { idx: number };
    const items: Item[] = [{ idx: 0 }, { idx: 1 }, { idx: 2 }];
    const result = partitionByViewport(items, (i) => i.idx, 100);
    expect(result.inside.map((i) => i.idx)).toEqual([0, 1, 2]);
    expect(result.outside).toEqual([]);
  });

  test("input 配列を mutate しない (純粋関数性)", () => {
    type Item = { idx: number };
    const items: Item[] = [{ idx: 0 }, { idx: 5 }];
    const snapshot = JSON.stringify(items);
    partitionByViewport(items, (i) => i.idx, 3);
    expect(JSON.stringify(items)).toBe(snapshot);
  });
});
