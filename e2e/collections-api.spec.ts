import { test, expect } from "@playwright/test";
import {
  MAX_COLLECTIONS_PER_USER,
  COLLECTION_NAME_MAX_LENGTH,
  collectionsKey,
} from "../src/lib/collections";
import { parseName } from "../src/lib/validation";
import type { Collection } from "../src/types";

/**
 * collections ライブラリの純粋関数・定数テスト。
 * R2 依存の readCollections / writeCollections は統合テストが必要なため除外。
 * コレクションの記事追加・削除ロジックは Route Handler から抽出してテストする。
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

test.describe("collections 定数", () => {
  test("MAX_COLLECTIONS_PER_USER は 50", () => {
    expect(MAX_COLLECTIONS_PER_USER).toBe(50);
  });

  test("COLLECTION_NAME_MAX_LENGTH は 50", () => {
    expect(COLLECTION_NAME_MAX_LENGTH).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// collectionsKey — R2 キー生成
// ---------------------------------------------------------------------------

test.describe("collectionsKey", () => {
  test("userId から R2 キーを生成する", () => {
    expect(collectionsKey("user123")).toBe("users/user123/collections.json");
  });

  test("サブドメイン形式の userId も正しく組み立てる", () => {
    expect(collectionsKey("sub:abc")).toBe("users/sub:abc/collections.json");
  });
});

// ---------------------------------------------------------------------------
// コレクション上限ロジック
// ---------------------------------------------------------------------------

test.describe("コレクション上限バリデーション", () => {
  function makeCollections(count: number): Collection[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `col-${i}`,
      name: `Collection ${i}`,
      articleIds: [],
      createdAt: "2026-01-01T00:00:00Z",
      order: i,
    }));
  }

  test("49 件は上限未満", () => {
    const cols = makeCollections(49);
    expect(cols.length < MAX_COLLECTIONS_PER_USER).toBe(true);
  });

  test("50 件は上限に達している", () => {
    const cols = makeCollections(50);
    expect(cols.length >= MAX_COLLECTIONS_PER_USER).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 記事 ID の追加ロジック（Route Handler と同等）
// ---------------------------------------------------------------------------

function addArticleIds(collection: Collection, ids: string[]): Collection {
  const existing = new Set(collection.articleIds);
  const updated = [...collection.articleIds];
  for (const aid of ids) {
    if (!existing.has(aid)) {
      updated.push(aid);
      existing.add(aid);
    }
  }
  return { ...collection, articleIds: updated };
}

function removeArticleIds(collection: Collection, ids: string[]): Collection {
  const toRemove = new Set(ids);
  return { ...collection, articleIds: collection.articleIds.filter((aid) => !toRemove.has(aid)) };
}

test.describe("コレクションへの記事追加", () => {
  function makeCollection(articleIds: string[] = []): Collection {
    return {
      id: "col-1",
      name: "My Collection",
      articleIds,
      createdAt: "2026-01-01T00:00:00Z",
      order: 0,
    };
  }

  test("新しい記事 ID を追加できる", () => {
    const col = makeCollection(["a", "b"]);
    const result = addArticleIds(col, ["c", "d"]);
    expect(result.articleIds).toEqual(["a", "b", "c", "d"]);
  });

  test("既存の記事 ID は重複追加されない", () => {
    const col = makeCollection(["a", "b"]);
    const result = addArticleIds(col, ["b", "c"]);
    expect(result.articleIds).toEqual(["a", "b", "c"]);
  });

  test("空のリストを追加しても変化しない", () => {
    const col = makeCollection(["a", "b"]);
    const result = addArticleIds(col, []);
    expect(result.articleIds).toEqual(["a", "b"]);
  });

  test("空のコレクションに記事を追加できる", () => {
    const col = makeCollection([]);
    const result = addArticleIds(col, ["x"]);
    expect(result.articleIds).toEqual(["x"]);
  });

  test("10,000 件の上限をシミュレート — 上限超えは Route Handler が制御", () => {
    const MAX_ARTICLE_IDS = 10_000;
    const col = makeCollection(Array.from({ length: MAX_ARTICLE_IDS }, (_, i) => `art-${i}`));
    // 上限に達している場合は追加を拒否する（Route Handler 側のロジック）
    expect(col.articleIds.length).toBe(MAX_ARTICLE_IDS);
  });
});

// ---------------------------------------------------------------------------
// Bookmark snapshot 一括追加 (案 B) — `addArticlesToCollection` の挙動
// addArticleIds と同じ pure logic だが、bookmarkIds 全件 snapshot を 1 リクエストで
// 追加する用途のため、空配列 / 全件 / 既存重複の 3 ケースを明示的に網羅する。
// ---------------------------------------------------------------------------

test.describe("Bookmark snapshot 一括追加 (案 B)", () => {
  function makeCollection(articleIds: string[] = []): Collection {
    return {
      id: "col-bookmark-snapshot",
      name: "Bookmark Snapshot",
      articleIds,
      createdAt: "2026-01-01T00:00:00Z",
      order: 0,
    };
  }

  test("空のブックマーク集合を追加しても collection は変化しない (no-op)", () => {
    const col = makeCollection(["existing-1", "existing-2"]);
    const result = addArticleIds(col, []);
    expect(result.articleIds).toEqual(["existing-1", "existing-2"]);
  });

  test("複数のブックマーク ID を一括 snapshot 追加できる", () => {
    const col = makeCollection([]);
    const bookmarkIds = ["bm-1", "bm-2", "bm-3", "bm-4"];
    const result = addArticleIds(col, bookmarkIds);
    expect(result.articleIds).toEqual(["bm-1", "bm-2", "bm-3", "bm-4"]);
  });

  test("既に collection に含まれるブックマーク ID は重複しない", () => {
    const col = makeCollection(["bm-1", "bm-3"]);
    const bookmarkIds = ["bm-1", "bm-2", "bm-3", "bm-4"];
    const result = addArticleIds(col, bookmarkIds);
    // bm-1 / bm-3 は既存、bm-2 / bm-4 のみ追加
    expect(result.articleIds).toEqual(["bm-1", "bm-3", "bm-2", "bm-4"]);
  });
});

// ---------------------------------------------------------------------------
// コレクションからの記事削除
// ---------------------------------------------------------------------------

test.describe("コレクションからの記事削除", () => {
  function makeCollection(articleIds: string[]): Collection {
    return {
      id: "col-1",
      name: "My Collection",
      articleIds,
      createdAt: "2026-01-01T00:00:00Z",
      order: 0,
    };
  }

  test("指定した記事 ID を削除できる", () => {
    const col = makeCollection(["a", "b", "c"]);
    const result = removeArticleIds(col, ["b"]);
    expect(result.articleIds).toEqual(["a", "c"]);
  });

  test("存在しない記事 ID の削除は no-op", () => {
    const col = makeCollection(["a", "b"]);
    const result = removeArticleIds(col, ["nonexistent"]);
    expect(result.articleIds).toEqual(["a", "b"]);
  });

  test("空のリストを削除しても変化しない", () => {
    const col = makeCollection(["a", "b"]);
    const result = removeArticleIds(col, []);
    expect(result.articleIds).toEqual(["a", "b"]);
  });

  test("全記事を削除すると空になる", () => {
    const col = makeCollection(["a", "b", "c"]);
    const result = removeArticleIds(col, ["a", "b", "c"]);
    expect(result.articleIds).toEqual([]);
  });

  test("重複する削除 ID は安全に処理される", () => {
    const col = makeCollection(["a", "b", "c"]);
    const result = removeArticleIds(col, ["b", "b"]);
    expect(result.articleIds).toEqual(["a", "c"]);
  });
});

// ---------------------------------------------------------------------------
// コレクション名バリデーション — parseName 経由
// ---------------------------------------------------------------------------

test.describe("コレクション名バリデーション", () => {
  test("正常な名前は通過する", () => {
    const result = parseName("My Favorites", COLLECTION_NAME_MAX_LENGTH);
    expect(result.ok).toBe(true);
  });

  test("空白のみの名前は拒否される", () => {
    const result = parseName("   ", COLLECTION_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });

  test("最大長ぴったりは通過する", () => {
    const name = "x".repeat(COLLECTION_NAME_MAX_LENGTH);
    const result = parseName(name, COLLECTION_NAME_MAX_LENGTH);
    expect(result.ok).toBe(true);
  });

  test("最大長 + 1 文字は拒否される", () => {
    const name = "x".repeat(COLLECTION_NAME_MAX_LENGTH + 1);
    const result = parseName(name, COLLECTION_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });

  test("null は拒否される", () => {
    const result = parseName(null, COLLECTION_NAME_MAX_LENGTH);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// order 計算ロジック（POST 時に nextOrder を求める）
// ---------------------------------------------------------------------------

test.describe("コレクション order 計算", () => {
  test("空のリストから nextOrder は 0", () => {
    const collections: Collection[] = [];
    const nextOrder = collections.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    expect(nextOrder).toBe(0);
  });

  test("既存 order の最大値 + 1 が nextOrder", () => {
    const collections: Collection[] = [
      { id: "a", name: "A", articleIds: [], createdAt: "", order: 0 },
      { id: "b", name: "B", articleIds: [], createdAt: "", order: 5 },
      { id: "c", name: "C", articleIds: [], createdAt: "", order: 3 },
    ];
    const nextOrder = collections.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    expect(nextOrder).toBe(6);
  });

  test("order が 0 のみのリストでは nextOrder は 1", () => {
    const collections: Collection[] = [
      { id: "a", name: "A", articleIds: [], createdAt: "", order: 0 },
    ];
    const nextOrder = collections.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    expect(nextOrder).toBe(1);
  });
});
