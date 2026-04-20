import { test, expect } from "@playwright/test";
import {
  emptyPendingSets,
  snapshotPendingSets,
  mergePendingSets,
  pruneExpiredSnoozes,
  normalizeTagName,
  normalizeTagArray,
  serializeReadState,
} from "../src/lib/read-state-storage";

test("emptyPendingSets は全 kind が空 Set を返す", () => {
  const sets = emptyPendingSets();
  expect(sets.read.size).toBe(0);
  expect(sets.bookmarks.size).toBe(0);
  expect(sets.readingList.size).toBe(0);
  expect(sets.likes.size).toBe(0);
});

test("snapshotPendingSets は独立したコピーを返す", () => {
  const original = emptyPendingSets();
  original.read.add("a");
  const snapshot = snapshotPendingSets(original);
  original.read.add("b");
  expect(snapshot.read.has("a")).toBe(true);
  expect(snapshot.read.has("b")).toBe(false);
});

test("mergePendingSets は source の全 ID を target にマージする", () => {
  const target = emptyPendingSets();
  target.read.add("a");
  const source = emptyPendingSets();
  source.read.add("b");
  source.bookmarks.add("c");
  mergePendingSets(target, source);
  expect(target.read).toEqual(new Set(["a", "b"]));
  expect(target.bookmarks).toEqual(new Set(["c"]));
});

test("pruneExpiredSnoozes は期限切れを除去し未来のみ返す", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  const result = pruneExpiredSnoozes({ a: future, b: past });
  expect(result).toEqual({ a: future });
});

test("normalizeTagName は制御文字・空白を除去し、空文字なら null を返す", () => {
  expect(normalizeTagName("  hello  ")).toBe("hello");
  expect(normalizeTagName("")).toBeNull();
  expect(normalizeTagName("   ")).toBeNull();
});

test("normalizeTagName は長すぎるタグ名に null を返す", () => {
  const long = "a".repeat(200);
  expect(normalizeTagName(long)).toBeNull();
});

test("normalizeTagArray は重複排除・件数上限を適用する", () => {
  const tags = ["a", "b", "a", "c"];
  expect(normalizeTagArray(tags)).toEqual(["a", "b", "c"]);
});

test("normalizeTagArray は無効なタグを���キップする", () => {
  const tags = ["valid", "", "   ", "ok"];
  expect(normalizeTagArray(tags)).toEqual(["valid", "ok"]);
});

test("serializeReadState は正しい JSON ペイロードを生成する", () => {
  const added = emptyPendingSets();
  added.read.add("r1");
  added.bookmarks.add("b1");
  const removed = emptyPendingSets();
  removed.likes.add("l1");
  const result = JSON.parse(
    serializeReadState(
      added,
      removed,
      null,
      "2026-01-01T00:00:00Z",
      { art1: "2026-12-01T00:00:00Z" },
      { art2: "my note" },
      {
        changedKeys: new Set(["art3"]),
        removedKeys: new Set(["art4"]),
        currentTags: { art3: ["tag1"] },
      },
      false,
    ),
  );
  expect(result.readIds).toEqual(["r1"]);
  expect(result.bookmarkIds).toEqual(["b1"]);
  expect(result.readingListIds).toEqual([]);
  expect(result.likeIds).toEqual([]);
  expect(result.readBeforeTimestamp).toBe("2026-01-01T00:00:00Z");
  expect(result.snoozedUntil).toEqual({ art1: "2026-12-01T00:00:00Z" });
  expect(result.notes).toEqual({ art2: "my note" });
  expect(result.tagIds).toEqual({ art3: ["tag1"] });
  expect(result.removedIds.likeIds).toEqual(["l1"]);
  expect(result.removedIds.tagIds).toEqual(["art4"]);
  expect(result.globalFilter).toBeUndefined();
});

test("serializeReadState は includeGlobalFilter=true で globalFilter を含める", () => {
  const added = emptyPendingSets();
  const removed = emptyPendingSets();
  const filter = { include: ["test"], exclude: [] };
  const result = JSON.parse(
    serializeReadState(
      added,
      removed,
      filter,
      null,
      {},
      {},
      { changedKeys: new Set(), removedKeys: new Set(), currentTags: {} },
      true,
    ),
  );
  expect(result.globalFilter).toEqual(filter);
});

test("serializeReadState は空ノート・空タグ・空スヌーズで null を出力する", () => {
  const added = emptyPendingSets();
  const removed = emptyPendingSets();
  const result = JSON.parse(
    serializeReadState(
      added,
      removed,
      null,
      null,
      {},
      {},
      { changedKeys: new Set(), removedKeys: new Set(), currentTags: {} },
      false,
    ),
  );
  expect(result.snoozedUntil).toBeNull();
  expect(result.notes).toBeNull();
  expect(result.tagIds).toBeNull();
});
