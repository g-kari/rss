import { test, expect } from "@playwright/test";
import {
  mergeReadStateUpdate,
  equalStringRecord,
  equalSnoozedUntil,
  equalNotes,
  equalTagIds,
} from "../src/lib/read-state-merge";
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
    ttlDays: null,
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

test("removedIds.notes に含まれる articleId は notes から除去される (#1084 cross-device note 削除)", () => {
  const existing: ReadState = {
    ...emptyState(),
    notes: { a: "note-a", b: "note-b" },
  };
  // 端末 A が note `a` を削除 → removedIds.notes で伝播
  const result = mergeReadStateUpdate(existing, {
    removedIds: { notes: ["a"] },
  });
  expect(result.notes).toEqual({ b: "note-b" });
});

test("removedIds.notes は incoming.notes にも適用される（削除優先）", () => {
  const existing: ReadState = { ...emptyState(), notes: { a: "old" } };
  // incoming で a を再送しつつ removedIds.notes でも a を指定 → 削除が優先
  const result = mergeReadStateUpdate(existing, {
    notes: { a: "resurrect-attempt", c: "note-c" },
    removedIds: { notes: ["a"] },
  });
  expect(result.notes).toEqual({ c: "note-c" });
});

test("シナリオ: 端末Aが note 削除 → removedIds で伝播して端末B由来の union で復活しない (#1084)", () => {
  // 端末 B (server) が note `x` を保持。端末 A が `x` を削除して removedIds.notes で送信。
  const serverState: ReadState = { ...emptyState(), notes: { x: "from-server", y: "keep" } };
  const result = mergeReadStateUpdate(serverState, {
    notes: {}, // A の現在 notes は空
    removedIds: { notes: ["x"] },
  });
  // x は復活せず削除が伝播、y は保持
  expect(result.notes).toEqual({ y: "keep" });
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
    ttlDays: null,
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

// ── maxReadIds trim テスト ────────────────────────────────

test("maxReadIds 指定時に readIds が上限を超えたら末尾（最新）を残して trim する", () => {
  const existing: ReadState = {
    ...emptyState(),
    readIds: Array.from({ length: 80 }, (_, i) => `old-${i}`),
  };
  const result = mergeReadStateUpdate(
    existing,
    {
      readIds: Array.from({ length: 40 }, (_, i) => `new-${i}`),
    },
    100,
  );
  expect(result.readIds.length).toBe(100);
  expect(result.readIds).not.toContain("old-0");
  expect(result.readIds).toContain("old-79");
  expect(result.readIds).toContain("new-39");
});

test("maxReadIds 未満の場合は trim しない", () => {
  const existing: ReadState = {
    ...emptyState(),
    readIds: ["a", "b", "c"],
  };
  const result = mergeReadStateUpdate(existing, { readIds: ["d"] }, 100);
  expect(result.readIds.length).toBe(4);
  expect(new Set(result.readIds)).toEqual(new Set(["a", "b", "c", "d"]));
});

test("maxReadIds を指定しない場合は trim しない（後方互換）", () => {
  const existing: ReadState = {
    ...emptyState(),
    readIds: Array.from({ length: 200 }, (_, i) => `id-${i}`),
  };
  const result = mergeReadStateUpdate(existing, {});
  expect(result.readIds.length).toBe(200);
});

// ── ttlDays マージ ──────────────────────────────────────────

test("ttlDays: update にキーが含まれていれば上書きする", () => {
  const existing: ReadState = { ...emptyState(), ttlDays: 30 };
  const result = mergeReadStateUpdate(existing, { ttlDays: 90 });
  expect(result.ttlDays).toBe(90);
});

test("ttlDays: update にキーがなければ既存値を保持する", () => {
  const existing: ReadState = { ...emptyState(), ttlDays: 60 };
  const result = mergeReadStateUpdate(existing, {});
  expect(result.ttlDays).toBe(60);
});

test("ttlDays: 0（無制限）で上書きできる", () => {
  const existing: ReadState = { ...emptyState(), ttlDays: 30 };
  const result = mergeReadStateUpdate(existing, { ttlDays: 0 });
  expect(result.ttlDays).toBe(0);
});

test("ttlDays: null で上書きするとデフォルトに戻る", () => {
  const existing: ReadState = { ...emptyState(), ttlDays: 90 };
  const result = mergeReadStateUpdate(existing, { ttlDays: null });
  expect(result.ttlDays).toBeNull();
});

test.describe("equalSnoozedUntil (#686)", () => {
  test("両方空オブジェクトなら true", () => {
    expect(equalSnoozedUntil({}, {})).toBe(true);
  });

  test("同一 reference は早期 true", () => {
    const a = { id1: "2026-05-09T00:00:00Z" };
    expect(equalSnoozedUntil(a, a)).toBe(true);
  });

  test("同じ key + 同じ value は true (別 reference でも)", () => {
    const a = { id1: "2026-05-09T00:00:00Z", id2: "2026-05-10T00:00:00Z" };
    const b = { id1: "2026-05-09T00:00:00Z", id2: "2026-05-10T00:00:00Z" };
    expect(equalSnoozedUntil(a, b)).toBe(true);
  });

  test("キー順序が違っても等価判定する (Record なので順序非関連)", () => {
    const a = { id1: "2026-05-09T00:00:00Z", id2: "2026-05-10T00:00:00Z" };
    const b = { id2: "2026-05-10T00:00:00Z", id1: "2026-05-09T00:00:00Z" };
    expect(equalSnoozedUntil(a, b)).toBe(true);
  });

  test("片方にだけキーがあれば false", () => {
    const a = { id1: "2026-05-09T00:00:00Z" };
    const b = {};
    expect(equalSnoozedUntil(a, b)).toBe(false);
    expect(equalSnoozedUntil(b, a)).toBe(false);
  });

  test("同じキーで違う値は false (期限延長など)", () => {
    const a = { id1: "2026-05-09T00:00:00Z" };
    const b = { id1: "2026-05-10T00:00:00Z" };
    expect(equalSnoozedUntil(a, b)).toBe(false);
  });

  test("キー数が同じでもキー名が違えば false", () => {
    const a = { id1: "2026-05-09T00:00:00Z" };
    const b = { id2: "2026-05-09T00:00:00Z" };
    expect(equalSnoozedUntil(a, b)).toBe(false);
  });

  test("片方が空オブジェクトでもう片方に entries があれば false", () => {
    expect(equalSnoozedUntil({}, { id1: "2026-05-09T00:00:00Z" })).toBe(false);
  });

  test("100 件の entries で全 key 一致なら true", () => {
    const a: Record<string, string> = {};
    const b: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      const ts = `2026-05-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`;
      a[`id${i}`] = ts;
      b[`id${i}`] = ts;
    }
    expect(equalSnoozedUntil(a, b)).toBe(true);
  });

  test("100 件のうち 1 件だけ値が違えば false", () => {
    const a: Record<string, string> = {};
    const b: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      const ts = `2026-05-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`;
      a[`id${i}`] = ts;
      b[`id${i}`] = ts;
    }
    b["id50"] = "2099-12-31T00:00:00Z";
    expect(equalSnoozedUntil(a, b)).toBe(false);
  });
});

test.describe("equalNotes", () => {
  test("両方空オブジェクトなら true", () => {
    expect(equalNotes({}, {})).toBe(true);
  });

  test("同一 reference は早期 true", () => {
    const a = { a1: "メモ 1" };
    expect(equalNotes(a, a)).toBe(true);
  });

  test("同じ key + 同じ value は true (別 reference でも)", () => {
    const a = { a1: "メモ 1", a2: "メモ 2" };
    const b = { a1: "メモ 1", a2: "メモ 2" };
    expect(equalNotes(a, b)).toBe(true);
  });

  test("キー順序が違っても等価判定する", () => {
    const a = { a1: "x", a2: "y" };
    const b = { a2: "y", a1: "x" };
    expect(equalNotes(a, b)).toBe(true);
  });

  test("片方にだけキーがあれば false", () => {
    expect(equalNotes({ a1: "x" }, {})).toBe(false);
    expect(equalNotes({}, { a1: "x" })).toBe(false);
  });

  test("同じキーで違う値は false (メモ更新)", () => {
    expect(equalNotes({ a1: "old" }, { a1: "new" })).toBe(false);
  });

  test("キー数が同じでもキー名が違えば false", () => {
    expect(equalNotes({ a1: "x" }, { a2: "x" })).toBe(false);
  });

  test("空文字列の値も区別される", () => {
    expect(equalNotes({ a1: "" }, { a1: "" })).toBe(true);
    expect(equalNotes({ a1: "" }, { a1: "x" })).toBe(false);
  });
});

test.describe("equalStringRecord (canonical)", () => {
  test("equalSnoozedUntil / equalNotes は equalStringRecord の alias (identity 一致)", () => {
    // helper drift 防止: 3 export は同一実装でなければならない
    expect(equalSnoozedUntil).toBe(equalStringRecord);
    expect(equalNotes).toBe(equalStringRecord);
  });

  test("基本等価判定 (空 / 同内容別 reference / キー順序非依存)", () => {
    expect(equalStringRecord({}, {})).toBe(true);
    expect(equalStringRecord({ a: "1", b: "2" }, { a: "1", b: "2" })).toBe(true);
    expect(equalStringRecord({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
  });

  test("差異検出 (キー数 / キー名 / 値)", () => {
    expect(equalStringRecord({ a: "1" }, {})).toBe(false);
    expect(equalStringRecord({ a: "1" }, { b: "1" })).toBe(false);
    expect(equalStringRecord({ a: "1" }, { a: "2" })).toBe(false);
  });
});

test.describe("equalTagIds", () => {
  test("両方空オブジェクトなら true", () => {
    expect(equalTagIds({}, {})).toBe(true);
  });

  test("同一 reference は早期 true", () => {
    const a = { a1: ["tech", "ai"] };
    expect(equalTagIds(a, a)).toBe(true);
  });

  test("同じ key + 同じ tag 配列 (順序含む) は true", () => {
    const a = { a1: ["tech", "ai"], a2: ["news"] };
    const b = { a1: ["tech", "ai"], a2: ["news"] };
    expect(equalTagIds(a, b)).toBe(true);
  });

  test("キー順序が違っても等価判定する", () => {
    const a = { a1: ["x"], a2: ["y"] };
    const b = { a2: ["y"], a1: ["x"] };
    expect(equalTagIds(a, b)).toBe(true);
  });

  test("片方にだけキーがあれば false", () => {
    expect(equalTagIds({ a1: ["x"] }, {})).toBe(false);
    expect(equalTagIds({}, { a1: ["x"] })).toBe(false);
  });

  test("同じキーで配列の長さが違えば false", () => {
    expect(equalTagIds({ a1: ["x"] }, { a1: ["x", "y"] })).toBe(false);
  });

  test("同じキーで配列内容 (要素値) が違えば false", () => {
    expect(equalTagIds({ a1: ["x", "y"] }, { a1: ["x", "z"] })).toBe(false);
  });

  test("配列の順序違いは false (UI 表示順を尊重)", () => {
    expect(equalTagIds({ a1: ["x", "y"] }, { a1: ["y", "x"] })).toBe(false);
  });

  test("空配列同士の同じキーは true", () => {
    expect(equalTagIds({ a1: [] }, { a1: [] })).toBe(true);
  });

  test("空配列と要素ありは false", () => {
    expect(equalTagIds({ a1: [] }, { a1: ["x"] })).toBe(false);
  });

  test("100 件の entries で全 key + 全 tag 一致なら true", () => {
    const a: Record<string, string[]> = {};
    const b: Record<string, string[]> = {};
    for (let i = 0; i < 100; i++) {
      const tags = [`tag${i}a`, `tag${i}b`];
      a[`id${i}`] = tags;
      b[`id${i}`] = [...tags];
    }
    expect(equalTagIds(a, b)).toBe(true);
  });

  test("100 件のうち 1 件だけタグ追加されていれば false", () => {
    const a: Record<string, string[]> = {};
    const b: Record<string, string[]> = {};
    for (let i = 0; i < 100; i++) {
      const tags = [`tag${i}`];
      a[`id${i}`] = tags;
      b[`id${i}`] = [...tags];
    }
    b["id50"] = ["tag50", "extra"];
    expect(equalTagIds(a, b)).toBe(false);
  });
});

test.describe("ISO 8601 lexicographic 比較バグ regression (#bug-#2 38th cycle)", () => {
  test("chooseLater: 旧 lexicographic で誤判定する attack vector を新 isLaterIso が正しく解決する", () => {
    // 旧実装の誤判定 attack vector:
    //   existing = "2026-01-01T00:00:00.000Z"   (絶対時刻 00:00:00 UTC)
    //   update   = "2026-01-01T00:00:01+00:00"  (絶対時刻 00:00:01 UTC, 1 秒後)
    //
    //   旧 lexicographic 比較: "2026-01-01T00:00:00.000Z" > "2026-01-01T00:00:01+00:00"
    //   (".000Z" の 0x2E > "00:01+" の 0x30 と思いきや、文字位置 17 で "0" vs "1" で
    //    update の方が大きい... 実際には position 19 の "." vs ":" でも比較される。
    //    本物のバグは UTC 同時刻で suffix 違いのとき、suffix 文字コード差 (+:0x2B / .:0x2E / Z:0x5A) で
    //    lexicographic 順が崩れること。)
    //
    // ここでは「絶対時刻は update が後だが lexicographic は existing が後」になるケースで
    // 新実装が **絶対時刻基準で正しく update を採用** することを確認する。
    //
    // 例: existing = "2026-01-01T00:00:00.999Z" (絶対時刻 .999 sec)
    //     update   = "2026-01-01T00:00:01+00:00" (絶対時刻 +1 sec, 0.001 後)
    //   旧 lexicographic: position 18 で "9" (0x39) > "1" (0x31) → existing の方が後と誤判定
    //   新 isLaterIso: Date.parse で 1ms 後の update が後 → 正しく update 採用
    const existing = "2026-01-01T00:00:00.999Z";
    const update = "2026-01-01T00:00:01+00:00";
    const merged = mergeReadStateUpdate({ readBeforeTimestamp: existing } as unknown as ReadState, {
      readBeforeTimestamp: update,
    });
    expect(merged.readBeforeTimestamp).toBe(update);
  });

  test("chooseLater: 同時刻の異 suffix では結果が安定する (同 sibling 規範)", () => {
    // 旧 lexicographic でも新 isLaterIso でも結果が一致。
    // 同時刻のとき strict greater は false → b (update) 採用が現状仕様。
    const a = "2026-01-01T00:00:00+00:00";
    const b = "2026-01-01T00:00:00.000Z";
    const merged = mergeReadStateUpdate({ readBeforeTimestamp: a } as unknown as ReadState, {
      readBeforeTimestamp: b,
    });
    expect(merged.readBeforeTimestamp).toBe(b);
  });

  test("chooseLater: 異なる時刻なら絶対時刻基準で正しく後を選ぶ", () => {
    const earlier = "2026-01-01T00:00:00+00:00";
    const later = "2026-01-01T00:00:01.000Z"; // 1 秒後
    const merged = mergeReadStateUpdate(
      {
        readBeforeTimestamp: earlier,
      } as unknown as ReadState,
      { readBeforeTimestamp: later },
    );
    expect(merged.readBeforeTimestamp).toBe(later);
  });

  test("mergeSnoozed: 同時刻 timezone suffix 違いは update を採用しない", () => {
    // 旧 lexicographic 実装では "+00:00" < ".000Z" なので update が採用されてしまうバグ。
    // 新 isLaterIso 実装では同時刻と判定 → 既存値を保持。
    const merged = mergeReadStateUpdate(
      {
        snoozedUntil: { article1: "2026-01-01T00:00:00+00:00" },
      } as unknown as ReadState,
      { snoozedUntil: { article1: "2026-01-01T00:00:00.000Z" } },
    );
    expect(merged.snoozedUntil?.article1).toBe("2026-01-01T00:00:00+00:00");
  });

  test("mergeSnoozed: 真に後の時刻は採用される", () => {
    const merged = mergeReadStateUpdate(
      {
        snoozedUntil: { article1: "2026-01-01T00:00:00+00:00" },
      } as unknown as ReadState,
      { snoozedUntil: { article1: "2026-01-02T00:00:00.000Z" } }, // 1 日後
    );
    expect(merged.snoozedUntil?.article1).toBe("2026-01-02T00:00:00.000Z");
  });

  test("不正な ISO 文字列が来てもデータ消失しない (NaN guard)", () => {
    const merged = mergeReadStateUpdate(
      {
        readBeforeTimestamp: "2026-01-01T00:00:00+00:00",
      } as unknown as ReadState,
      { readBeforeTimestamp: "garbage-date" },
    );
    // isLaterIso が false を返して既存値を保持
    expect(merged.readBeforeTimestamp).toBe("2026-01-01T00:00:00+00:00");
  });
});
