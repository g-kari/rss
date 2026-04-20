import { test, expect } from "@playwright/test";
import { mergeReadStateUpdate } from "../src/lib/read-state-merge";
import type { ReadState } from "../src/types";

/**
 * POST /api/read-state のマージロジック `mergeReadStateUpdate` の単体テスト。
 *
 * issue #62: 端末間で既読・いいね・後で読む状態がズレる問題への対策。
 * - readIds / bookmarkIds / readingListIds / likeIds は (existing ∪ update) \ removed
 * - 追加は他端末の変更を失わず、削除は明示 removedIds で伝播する
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
  };
}

test("既存と update の readIds を union する（他端末の追加が消えない）", () => {
  const existing: ReadState = { ...emptyState(), readIds: ["a", "b"] };
  const result = mergeReadStateUpdate(existing, { readIds: ["c", "d"] });
  expect(new Set(result.readIds)).toEqual(new Set(["a", "b", "c", "d"]));
});

test("removedIds.readIds は既存からも update からも除外する", () => {
  const existing: ReadState = { ...emptyState(), readIds: ["a", "b", "c"] };
  const result = mergeReadStateUpdate(existing, {
    readIds: ["a", "d"],
    removedIds: { readIds: ["b", "d"] },
  });
  expect(new Set(result.readIds)).toEqual(new Set(["a", "c"]));
});

test("bookmarkIds / readingListIds / likeIds も同様に union マージする", () => {
  const existing: ReadState = {
    ...emptyState(),
    bookmarkIds: ["b1"],
    readingListIds: ["r1"],
    likeIds: ["l1"],
  };
  const result = mergeReadStateUpdate(existing, {
    bookmarkIds: ["b2"],
    readingListIds: ["r2"],
    likeIds: ["l2"],
    removedIds: { bookmarkIds: ["b1"], readingListIds: ["r1"], likeIds: ["l1"] },
  });
  expect(result.bookmarkIds).toEqual(["b2"]);
  expect(result.readingListIds).toEqual(["r2"]);
  expect(result.likeIds).toEqual(["l2"]);
});

test("globalFilter が update に含まれていれば上書き、含まれなければ既存を保持", () => {
  const existing: ReadState = {
    ...emptyState(),
    globalFilter: { include: ["old"], exclude: [] },
  };

  const kept = mergeReadStateUpdate(existing, { readIds: ["a"] });
  expect(kept.globalFilter).toEqual({ include: ["old"], exclude: [] });

  const overwritten = mergeReadStateUpdate(existing, {
    globalFilter: { include: ["new"], exclude: [] },
  });
  expect(overwritten.globalFilter).toEqual({ include: ["new"], exclude: [] });

  const cleared = mergeReadStateUpdate(existing, { globalFilter: null });
  expect(cleared.globalFilter).toBeNull();
});

test("readBeforeTimestamp はより遅い方を採用する", () => {
  const existing: ReadState = {
    ...emptyState(),
    readBeforeTimestamp: "2026-01-01T00:00:00Z",
  };

  const newer = mergeReadStateUpdate(existing, {
    readBeforeTimestamp: "2026-04-17T00:00:00Z",
  });
  expect(newer.readBeforeTimestamp).toBe("2026-04-17T00:00:00Z");

  const older = mergeReadStateUpdate(existing, {
    readBeforeTimestamp: "2025-01-01T00:00:00Z",
  });
  expect(older.readBeforeTimestamp).toBe("2026-01-01T00:00:00Z");

  const missing = mergeReadStateUpdate(existing, {});
  expect(missing.readBeforeTimestamp).toBe("2026-01-01T00:00:00Z");
});

test("snoozedUntil はキー単位で until が遅い方を採用する", () => {
  const existing: ReadState = {
    ...emptyState(),
    snoozedUntil: {
      a: "2026-05-01T00:00:00Z",
      b: "2026-06-01T00:00:00Z",
    },
  };
  const result = mergeReadStateUpdate(existing, {
    snoozedUntil: {
      a: "2026-07-01T00:00:00Z", // 遅い方を採用
      b: "2026-01-01T00:00:00Z", // 遅い既存を保持
      c: "2026-08-01T00:00:00Z", // 新規キー
    },
  });
  expect(result.snoozedUntil).toEqual({
    a: "2026-07-01T00:00:00Z",
    b: "2026-06-01T00:00:00Z",
    c: "2026-08-01T00:00:00Z",
  });
});

test("notes は update 優先でキー単位マージ（既存にあるキーは update で上書き、他端末のキーは保持）", () => {
  const existing: ReadState = {
    ...emptyState(),
    notes: {
      a: "old-a",
      other: "other-device", // 他端末が追加したノート
    },
  };
  const result = mergeReadStateUpdate(existing, {
    notes: {
      a: "new-a", // 上書き
      b: "new-b", // 新規
    },
  });
  expect(result.notes).toEqual({
    a: "new-a",
    b: "new-b",
    other: "other-device",
  });
});

test("空の update はすべて既存値を保持する", () => {
  const existing: ReadState = {
    readIds: ["a"],
    bookmarkIds: ["b"],
    readingListIds: ["r"],
    likeIds: ["l"],
    globalFilter: { include: ["x"], exclude: [] },
    readBeforeTimestamp: "2026-01-01T00:00:00Z",
    snoozedUntil: { k: "2026-12-01T00:00:00Z" },
    notes: { n: "note" },
    tagIds: null,
  };
  const result = mergeReadStateUpdate(existing, {});
  expect(result).toEqual(existing);
});

test("シナリオ: 端末Aが既読追加・端末Bも同時に既読追加 → 両方残る", () => {
  const serverAfterA: ReadState = {
    ...emptyState(),
    readIds: ["device-a-1", "device-a-2"],
  };
  const updateFromB = { readIds: ["device-b-1", "device-b-2"] };
  const afterB = mergeReadStateUpdate(serverAfterA, updateFromB);
  expect(new Set(afterB.readIds)).toEqual(
    new Set(["device-a-1", "device-a-2", "device-b-1", "device-b-2"]),
  );
});

test("シナリオ: 端末Aが既読解除 → removedIds で伝播して端末B由来の union で復活しない", () => {
  const serverState: ReadState = { ...emptyState(), readIds: ["x", "y"] };
  const updateFromA = {
    readIds: ["x"], // y は残っていない（端末A で解除済み）
    removedIds: { readIds: ["y"] },
  };
  const result = mergeReadStateUpdate(serverState, updateFromA);
  expect(result.readIds).toEqual(["x"]);
});

// ── tagIds マージ仕様テスト ────────────────────────────────

test("tagIds は incoming のキーが既存を上書きする", () => {
  const existing: ReadState = {
    ...emptyState(),
    tagIds: { a: ["x", "y"], b: ["z"] },
  };
  const result = mergeReadStateUpdate(existing, {
    tagIds: { a: ["new"] },
  });
  expect(result.tagIds).toEqual({ a: ["new"], b: ["z"] });
});

test("removedIds.tagIds に含まれる articleId は tagIds から除去される", () => {
  const existing: ReadState = {
    ...emptyState(),
    tagIds: { a: ["x"], b: ["y"] },
  };
  const result = mergeReadStateUpdate(existing, {
    removedIds: { tagIds: ["a"] },
  });
  expect(result.tagIds).toEqual({ b: ["y"] });
});

test("tagIds の incoming と removedIds.tagIds が両方空なら既存をそのまま返す", () => {
  const existing: ReadState = {
    ...emptyState(),
    tagIds: { a: ["x"] },
  };
  const result = mergeReadStateUpdate(existing, {});
  expect(result.tagIds).toEqual({ a: ["x"] });
});

test("tagIds が既存も incoming も空なら null を返す", () => {
  const result = mergeReadStateUpdate(emptyState(), {});
  expect(result.tagIds).toBeNull();
});

test("removedIds.tagIds は incoming.tagIds にも適用される（優先）", () => {
  const existing: ReadState = {
    ...emptyState(),
    tagIds: { a: ["old"] },
  };
  const result = mergeReadStateUpdate(existing, {
    tagIds: { a: ["new"] },
    removedIds: { tagIds: ["a"] },
  });
  expect(result.tagIds).toBeNull();
});
