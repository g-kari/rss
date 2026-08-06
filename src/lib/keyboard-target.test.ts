import { describe, expect, it } from "vitest";
import { isEditableShortcutTarget } from "./keyboard-target";

describe("isEditableShortcutTarget", () => {
  it("DOM がない実行環境でも null と通常オブジェクトを安全に判定する", () => {
    expect(isEditableShortcutTarget(null)).toBe(false);
    expect(isEditableShortcutTarget({} as EventTarget)).toBe(false);
  });
});
