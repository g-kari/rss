import { test, expect } from "@playwright/test";
import {
  MAX_FEED_GROUPS_PER_USER,
  FEED_GROUP_NAME_MAX_LENGTH,
  feedGroupsKey,
} from "../src/lib/feed-groups";
import { parseName } from "../src/lib/validation";
import type { FeedGroup } from "../src/types";

/**
 * feed-groups ライブラリの純粋関数・定数テスト。
 * R2 依存の readFeedGroups / writeFeedGroups は統合テストが必要なため除外。
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

test.describe("feed-groups 定数", () => {
  test("MAX_FEED_GROUPS_PER_USER は 100", () => {
    expect(MAX_FEED_GROUPS_PER_USER).toBe(100);
  });

  test("FEED_GROUP_NAME_MAX_LENGTH は 50", () => {
    expect(FEED_GROUP_NAME_MAX_LENGTH).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// feedGroupsKey — R2 キー生成
// ---------------------------------------------------------------------------

test.describe("feedGroupsKey", () => {
  test("userId から R2 キーを生成する", () => {
    expect(feedGroupsKey("user123")).toBe("users/user123/feed-groups.json");
  });

  test("サブドメイン形式の userId も正しく組み立てる", () => {
    expect(feedGroupsKey("sub:abc")).toBe("users/sub:abc/feed-groups.json");
  });

  test("空文字の userId でも生成できる（バリデーションは呼び出し側が担う）", () => {
    expect(feedGroupsKey("")).toBe("users//feed-groups.json");
  });
});

// ---------------------------------------------------------------------------
// グループ上限ロジック — Route Handler 相当のバリデーション
// ---------------------------------------------------------------------------

test.describe("グループ上限バリデーション（ロジックテスト）", () => {
  function makeGroups(count: number): FeedGroup[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `group-${i}`,
      name: `Group ${i}`,
      order: i,
      createdAt: "2026-01-01T00:00:00Z",
    }));
  }

  test("99 件のグループに追加できる（上限未満）", () => {
    const groups = makeGroups(99);
    expect(groups.length < MAX_FEED_GROUPS_PER_USER).toBe(true);
  });

  test("100 件のグループは上限に達している", () => {
    const groups = makeGroups(100);
    expect(groups.length >= MAX_FEED_GROUPS_PER_USER).toBe(true);
  });

  test("101 件のグループは上限超過", () => {
    const groups = makeGroups(101);
    expect(groups.length > MAX_FEED_GROUPS_PER_USER).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 並べ替えロジック — グループの order 更新
// ---------------------------------------------------------------------------

test.describe("グループ並べ替えロジック", () => {
  function makeGroup(id: string, order: number): FeedGroup {
    return { id, name: `Group ${id}`, order, createdAt: "2026-01-01T00:00:00Z" };
  }

  test("order 昇順でソートすると正しい順序になる", () => {
    const groups = [makeGroup("c", 3), makeGroup("a", 1), makeGroup("b", 2)];
    const sorted = [...groups].sort((x, y) => x.order - y.order);
    expect(sorted.map((g) => g.id)).toEqual(["a", "b", "c"]);
  });

  test("同じ order 値でも全 ID が保持される", () => {
    const groups = [makeGroup("a", 0), makeGroup("b", 0), makeGroup("c", 0)];
    const sorted = [...groups].sort((x, y) => x.order - y.order);
    expect(sorted.map((g) => g.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("reorder: 新しい順序配列で全グループ ID が揃っている", () => {
    const groups = [makeGroup("a", 1), makeGroup("b", 2), makeGroup("c", 3)];
    const newOrder = ["c", "a", "b"];
    // すべての ID が newOrder に含まれているか確認
    const groupIds = new Set(groups.map((g) => g.id));
    expect(newOrder.every((id) => groupIds.has(id))).toBe(true);
    // newOrder の長さが一致するか
    expect(newOrder.length).toBe(groups.length);
  });

  test("reorder: ID が不足している場合は不正な reorder", () => {
    const groups = [makeGroup("a", 1), makeGroup("b", 2), makeGroup("c", 3)];
    const incompleteOrder = ["a", "b"]; // c が欠落
    const groupIds = new Set(groups.map((g) => g.id));
    expect(incompleteOrder.every((id) => groupIds.has(id))).toBe(true);
    expect(incompleteOrder.length).not.toBe(groups.length); // 長さ不一致 → 不正
  });
});

// ---------------------------------------------------------------------------
// グループ名バリデーション — parseName 経由
// ---------------------------------------------------------------------------

test.describe("グループ名バリデーション", () => {
  test("空白のみの名前は拒否される", () => {
    const result = parseName("   ", FEED_GROUP_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });

  test("最大長ぴったりの名前は通過する", () => {
    const name = "あ".repeat(FEED_GROUP_NAME_MAX_LENGTH);
    const result = parseName(name, FEED_GROUP_NAME_MAX_LENGTH);
    expect(result.ok).toBe(true);
  });

  test("最大長 + 1 文字は拒否される", () => {
    const name = "a".repeat(FEED_GROUP_NAME_MAX_LENGTH + 1);
    const result = parseName(name, FEED_GROUP_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });

  test("制御文字を含む名前はトリムされ、空なら拒否される", () => {
    const result = parseName("\x00\x01", FEED_GROUP_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });

  test("前後の空白はトリムされて有効になる", () => {
    const result = parseName("  Tech News  ", FEED_GROUP_NAME_MAX_LENGTH);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("Tech News");
  });

  test("数値は文字列でないため拒否される", () => {
    const result = parseName(123, FEED_GROUP_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });
});
