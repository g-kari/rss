import { test, expect } from "@playwright/test";
import { mergeReadStateUpdate, normalizeReadState } from "../src/lib/read-state-merge";
import type { ReadState } from "../src/types";

/**
 * POST /api/read-state のエッジケーステスト。
 * 基本的なマージテストは e2e/read-state-merge.spec.ts に存在する。
 * ここでは removedIds の全フィールド・ttlDays・readBeforeTimestamp などの
 * 追加エッジケースを網羅する。
 */

function emptyState(): ReadState {
  return {
    readIds: [],
    bookmarkIds: [],
    readingListIds: [],
    likeIds: [],
    globalFilter: null,
    readBeforeTimestamp: null,
    snoozedUntil: null,
    notes: null,
    tagIds: null,
    ttlDays: null,
  };
}

// ---------------------------------------------------------------------------
// removedIds — 全フィールドの削除伝播
// ---------------------------------------------------------------------------

test.describe("removedIds — 全フィールドの削除伝播", () => {
  test("removedIds.readingListIds は readingListIds から除去される", () => {
    const existing: ReadState = { ...emptyState(), readingListIds: ["r1", "r2", "r3"] };
    const result = mergeReadStateUpdate(existing, {
      removedIds: { readingListIds: ["r1", "r3"] },
    });
    expect(result.readingListIds).toEqual(["r2"]);
  });

  test("removedIds.likeIds は likeIds から除去される", () => {
    const existing: ReadState = { ...emptyState(), likeIds: ["l1", "l2"] };
    const result = mergeReadStateUpdate(existing, {
      likeIds: ["l3"],
      removedIds: { likeIds: ["l1"] },
    });
    expect(new Set(result.likeIds)).toEqual(new Set(["l2", "l3"]));
  });

  test("removedIds.bookmarkIds は bookmarkIds から除去される", () => {
    const existing: ReadState = { ...emptyState(), bookmarkIds: ["b1", "b2", "b3"] };
    const result = mergeReadStateUpdate(existing, {
      removedIds: { bookmarkIds: ["b2"] },
    });
    expect(new Set(result.bookmarkIds)).toEqual(new Set(["b1", "b3"]));
  });

  test("removedIds.tagIds はキーを tagIds から除去する", () => {
    const existing: ReadState = {
      ...emptyState(),
      tagIds: { art1: ["tag-a"], art2: ["tag-b"], art3: ["tag-c"] },
    };
    const result = mergeReadStateUpdate(existing, {
      removedIds: { tagIds: ["art1", "art3"] },
    });
    expect(result.tagIds).toEqual({ art2: ["tag-b"] });
  });

  test("removedIds に存在しない ID を指定しても安全（no-op）", () => {
    const existing: ReadState = { ...emptyState(), readIds: ["a", "b"] };
    const result = mergeReadStateUpdate(existing, {
      removedIds: { readIds: ["nonexistent"] },
    });
    expect(new Set(result.readIds)).toEqual(new Set(["a", "b"]));
  });

  test("全フィールドを同時に removedIds で削除できる", () => {
    const existing: ReadState = {
      ...emptyState(),
      readIds: ["r1"],
      bookmarkIds: ["b1"],
      readingListIds: ["rl1"],
      likeIds: ["l1"],
      tagIds: { a: ["x"] },
    };
    const result = mergeReadStateUpdate(existing, {
      removedIds: {
        readIds: ["r1"],
        bookmarkIds: ["b1"],
        readingListIds: ["rl1"],
        likeIds: ["l1"],
        tagIds: ["a"],
      },
    });
    expect(result.readIds).toEqual([]);
    expect(result.bookmarkIds).toEqual([]);
    expect(result.readingListIds).toEqual([]);
    expect(result.likeIds).toEqual([]);
    expect(result.tagIds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ttlDays — バリデーション相当の動作確認
// ---------------------------------------------------------------------------

test.describe("ttlDays — 値の保持と上書き", () => {
  test("ttlDays: 0 は無制限を意味し保持される", () => {
    const existing: ReadState = { ...emptyState(), ttlDays: 30 };
    const result = mergeReadStateUpdate(existing, { ttlDays: 0 });
    expect(result.ttlDays).toBe(0);
  });

  test("ttlDays: 正の値（1〜365）は保持される", () => {
    for (const days of [1, 7, 30, 90, 180, 365]) {
      const result = mergeReadStateUpdate(emptyState(), { ttlDays: days });
      expect(result.ttlDays).toBe(days);
    }
  });

  test("ttlDays: null で上書きすると無制限に戻る", () => {
    const existing: ReadState = { ...emptyState(), ttlDays: 365 };
    const result = mergeReadStateUpdate(existing, { ttlDays: null });
    expect(result.ttlDays).toBeNull();
  });

  test("ttlDays: update にキーがなければ既存値を引き継ぐ", () => {
    const existing: ReadState = { ...emptyState(), ttlDays: 14 };
    const result = mergeReadStateUpdate(existing, {});
    expect(result.ttlDays).toBe(14);
  });

  test("ttlDays: 両方 null のとき null のまま", () => {
    const result = mergeReadStateUpdate(emptyState(), { ttlDays: null });
    expect(result.ttlDays).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readBeforeTimestamp — 新しい方を採用
// ---------------------------------------------------------------------------

test.describe("readBeforeTimestamp — 更新ルール", () => {
  test("update が新しければ update を採用する", () => {
    const existing: ReadState = {
      ...emptyState(),
      readBeforeTimestamp: "2025-01-01T00:00:00Z",
    };
    const result = mergeReadStateUpdate(existing, {
      readBeforeTimestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.readBeforeTimestamp).toBe("2026-01-01T00:00:00Z");
  });

  test("既存が新しければ既存を保持する（後退しない）", () => {
    const existing: ReadState = {
      ...emptyState(),
      readBeforeTimestamp: "2026-06-01T00:00:00Z",
    };
    const result = mergeReadStateUpdate(existing, {
      readBeforeTimestamp: "2025-01-01T00:00:00Z",
    });
    expect(result.readBeforeTimestamp).toBe("2026-06-01T00:00:00Z");
  });

  test("既存が null で update に値がある場合は update を採用", () => {
    const result = mergeReadStateUpdate(emptyState(), {
      readBeforeTimestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.readBeforeTimestamp).toBe("2026-01-01T00:00:00Z");
  });

  test("update が含まれない場合は既存を保持する", () => {
    const existing: ReadState = {
      ...emptyState(),
      readBeforeTimestamp: "2026-01-01T00:00:00Z",
    };
    const result = mergeReadStateUpdate(existing, {});
    expect(result.readBeforeTimestamp).toBe("2026-01-01T00:00:00Z");
  });

  test("同じ値の場合はそのまま保持する", () => {
    const ts = "2026-03-15T12:00:00Z";
    const existing: ReadState = { ...emptyState(), readBeforeTimestamp: ts };
    const result = mergeReadStateUpdate(existing, { readBeforeTimestamp: ts });
    expect(result.readBeforeTimestamp).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// normalizeReadState — 古い形式からの補完
// ---------------------------------------------------------------------------

test.describe("normalizeReadState — デフォルト値の補完", () => {
  test("空オブジェクトを渡すと全フィールドにデフォルト値が入る", () => {
    const result = normalizeReadState({});
    expect(result.readIds).toEqual([]);
    expect(result.bookmarkIds).toEqual([]);
    expect(result.readingListIds).toEqual([]);
    expect(result.likeIds).toEqual([]);
    expect(result.globalFilter).toBeNull();
    expect(result.readBeforeTimestamp).toBeNull();
    expect(result.snoozedUntil).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.tagIds).toBeNull();
    expect(result.ttlDays).toBeNull();
  });

  test("既存の値は上書きされない", () => {
    const result = normalizeReadState({
      readIds: ["a", "b"],
      ttlDays: 30,
    });
    expect(result.readIds).toEqual(["a", "b"]);
    expect(result.ttlDays).toBe(30);
    // 指定されなかったフィールドはデフォルト
    expect(result.bookmarkIds).toEqual([]);
  });

  test("null 値は null のまま（undefined とは区別）", () => {
    const result = normalizeReadState({ ttlDays: null });
    expect(result.ttlDays).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// snoozedUntil — スヌーズ期限のマージ
// ---------------------------------------------------------------------------

test.describe("snoozedUntil — 期限マージのエッジケース", () => {
  test("既存 null + incoming あり → incoming を採用", () => {
    const result = mergeReadStateUpdate(emptyState(), {
      snoozedUntil: { art1: "2026-12-01T09:00:00Z" },
    });
    expect(result.snoozedUntil).toEqual({ art1: "2026-12-01T09:00:00Z" });
  });

  test("既存あり + incoming null → 既存を保持", () => {
    const existing: ReadState = {
      ...emptyState(),
      snoozedUntil: { art1: "2026-12-01T09:00:00Z" },
    };
    const result = mergeReadStateUpdate(existing, {});
    expect(result.snoozedUntil).toEqual({ art1: "2026-12-01T09:00:00Z" });
  });

  test("両方 null → null を返す", () => {
    const result = mergeReadStateUpdate(emptyState(), {});
    expect(result.snoozedUntil).toBeNull();
  });

  test("同一キーで期限が同じ場合はそのまま保持", () => {
    const ts = "2026-12-01T09:00:00Z";
    const existing: ReadState = { ...emptyState(), snoozedUntil: { art1: ts } };
    const result = mergeReadStateUpdate(existing, { snoozedUntil: { art1: ts } });
    expect(result.snoozedUntil?.art1).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// notes — メモのマージエッジケース
// ---------------------------------------------------------------------------

test.describe("notes — メモマージのエッジケース", () => {
  test("既存 null + incoming あり → incoming を採用", () => {
    const result = mergeReadStateUpdate(emptyState(), {
      notes: { art1: "メモテキスト" },
    });
    expect(result.notes).toEqual({ art1: "メモテキスト" });
  });

  test("既存あり + incoming null → 既存を保持", () => {
    const existing: ReadState = {
      ...emptyState(),
      notes: { art1: "既存メモ" },
    };
    const result = mergeReadStateUpdate(existing, {});
    expect(result.notes).toEqual({ art1: "既存メモ" });
  });

  test("両方空の場合は null を返す", () => {
    const result = mergeReadStateUpdate(emptyState(), {});
    expect(result.notes).toBeNull();
  });

  test("incoming で同一キーを上書き（サーバー優先）", () => {
    const existing: ReadState = {
      ...emptyState(),
      notes: { art1: "古いメモ" },
    };
    const result = mergeReadStateUpdate(existing, { notes: { art1: "新しいメモ" } });
    expect(result.notes?.art1).toBe("新しいメモ");
  });
});
