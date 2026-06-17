import { test, expect } from "@playwright/test";
import { SHORTCUT_DEFS, SHORTCUT_MAP } from "../src/config/shortcuts";
import type { ShortcutContext } from "../src/config/shortcuts";

/**
 * src/config/shortcuts.ts の SHORTCUT_DEFS が sibling filter (unreadOnly / bookmarkOnly /
 * readingListOnly / likeOnly / noteOnly / digestMode) すべてに対応する handler を持つことを
 * 検証する spec。#1147 で追加した noteOnly の "N" entry も含めて完全性を担保する。
 *
 * 各 handler は ctx を受けて `toggleXxxOnly()` を呼ぶシンプルな relay なので、entry の
 * 存在 + group 分類 + handler 動作 (toggle 呼出 + showToast 呼出) を 1 件で網羅する。
 */

test.describe("SHORTCUT_DEFS — filter group の完全性", () => {
  const filterEntries = SHORTCUT_DEFS.filter((d) => d.group === "filter");

  test("filter group に 6 件のエントリ (unreadOnly / bookmarkOnly / readingListOnly / likeOnly / noteOnly / digestMode)", () => {
    const keys = filterEntries.map((d) => d.keys[0]).sort();
    expect(keys).toEqual(["B", "D", "I", "N", "T", "u"]);
  });

  test("各 filter entry に description + handler 必須", () => {
    for (const def of filterEntries) {
      expect(def.description, `key=${def.keys[0]}`).toBeTruthy();
      expect(def.handler, `key=${def.keys[0]}`).toBeInstanceOf(Function);
    }
  });

  test("SHORTCUT_MAP に N (noteOnly) の description が含まれる", () => {
    expect(SHORTCUT_MAP["N"]).toBe("メモありフィルター切替");
  });
});

test.describe("SHORTCUT_DEFS — N (noteOnly) handler 動作", () => {
  test("N handler は ctx.toggleNoteOnly() + showToast を呼ぶ", () => {
    const noteDef = SHORTCUT_DEFS.find((d) => d.keys[0] === "N");
    expect(noteDef).toBeDefined();
    expect(noteDef!.group).toBe("filter");

    let toggleCalled = 0;
    let toastMsg: string | null = null;
    const ctx = {
      noteOnly: false,
      toggleNoteOnly: () => {
        toggleCalled++;
      },
      showToast: (msg: string) => {
        toastMsg = msg;
      },
    } as unknown as ShortcutContext;

    noteDef!.handler!(ctx, new KeyboardEvent("keydown", { key: "N" }));

    expect(toggleCalled).toBe(1);
    expect(toastMsg).toContain("メモありフィルター");
  });
});
