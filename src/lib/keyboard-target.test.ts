import { describe, expect, it } from "vitest";
import { isEditableShortcutTarget } from "./keyboard-target";

describe("isEditableShortcutTarget", () => {
  it("DOM がない実行環境でも null と通常オブジェクトを安全に判定する", () => {
    expect(isEditableShortcutTarget(null)).toBe(false);
    expect(isEditableShortcutTarget({} as EventTarget)).toBe(false);
  });

  it("編集可能な DOM 要素を抑制対象として判定する", () => {
    expect(isEditableShortcutTarget(document.createElement("input"))).toBe(true);
    expect(isEditableShortcutTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableShortcutTarget(document.createElement("select"))).toBe(true);
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    expect(isEditableShortcutTarget(editor)).toBe(true);
    expect(isEditableShortcutTarget(document.createElement("button"))).toBe(false);
  });
});
