import { describe, expect, it } from "vitest";
import { addRangeToSelection, computeBulkSelectionRange } from "./bulk-selection";

describe("computeBulkSelectionRange (#883)", () => {
  const ids = ["a", "b", "c", "d", "e"] as const;

  it("anchor null なら target 単独を返す", () => {
    expect(computeBulkSelectionRange(ids, null, "c")).toEqual(["c"]);
  });

  it("anchor と target が同一なら target 単独を返す", () => {
    expect(computeBulkSelectionRange(ids, "c", "c")).toEqual(["c"]);
  });

  it("anchor が target より前にあるとき anchor→target の範囲を返す", () => {
    expect(computeBulkSelectionRange(ids, "b", "d")).toEqual(["b", "c", "d"]);
  });

  it("anchor が target より後にあるとき target→anchor の範囲を返す (順序は orderedIds 順)", () => {
    expect(computeBulkSelectionRange(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("anchor が orderedIds に存在しないとき target 単独を返す", () => {
    expect(computeBulkSelectionRange(ids, "zzz", "c")).toEqual(["c"]);
  });

  it("target が orderedIds に存在しないとき target 単独を返す", () => {
    expect(computeBulkSelectionRange(ids, "a", "zzz")).toEqual(["zzz"]);
  });

  it("orderedIds が空のとき target 単独を返す", () => {
    expect(computeBulkSelectionRange([], "a", "b")).toEqual(["b"]);
  });

  it("anchor と target が両端のとき全 ID を返す", () => {
    expect(computeBulkSelectionRange(ids, "a", "e")).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("addRangeToSelection (#883)", () => {
  it("空 Set に range を追加すると range の Set を返す", () => {
    expect([...addRangeToSelection(new Set(), ["a", "b"])]).toEqual(["a", "b"]);
  });

  it("既存 ID を含む range を追加しても重複しない", () => {
    expect([...addRangeToSelection(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
  });

  it("元の Set は変更されない (immutable)", () => {
    const original = new Set(["x"]);
    addRangeToSelection(original, ["y", "z"]);
    expect([...original]).toEqual(["x"]);
  });

  it("range が空配列なら元と同等 Set を返す", () => {
    const next = addRangeToSelection(new Set(["a", "b"]), []);
    expect([...next].sort()).toEqual(["a", "b"]);
  });
});
