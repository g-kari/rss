import { test, expect } from "@playwright/test";
import { SHORTCUT_DEFS, SHORTCUT_MAP } from "../src/config/shortcuts";
import type { ShortcutContext } from "../src/config/shortcuts";

test("ユーザー設定ショートカットは canonical 定義とヘルプ表示に含まれる", () => {
  const settings = SHORTCUT_DEFS.find((definition) => definition.displayKey === ",");
  expect(settings).toMatchObject({
    keys: [","],
    description: "ユーザー設定を表示",
    group: "global",
  });
  expect(SHORTCUT_MAP[","]).toBe("ユーザー設定を表示");
});

test("検索ショートカットはスラッシュと Ctrl/Cmd+K を受け付ける", () => {
  const search = SHORTCUT_DEFS.find((definition) => definition.displayKey.startsWith("/"));
  expect(search?.keys).toEqual(["/", "Control+k", "Meta+k"]);
  expect(SHORTCUT_MAP["/ / Ctrl+K"]).toBe("記事を検索");
});

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

  test("filter group に sibling filter 6 種 (unreadOnly / bookmarkOnly / readingListOnly / likeOnly / noteOnly / digestMode) が揃う", () => {
    // 完全性 (6 種すべて存在) を検証する superset assert。
    // exact equality にすると filter group への新規追加 (日付 "d" / ソート順 "s" /
    // 読了時間 "w" 等) のたびに spec が stale 化して無関係な fail を出すため。
    const keys = filterEntries.map((d) => d.keys[0]);
    for (const required of ["B", "D", "I", "N", "T", "u"]) {
      expect(keys, `filter group に "${required}" が存在すること`).toContain(required);
    }
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

    // 本 spec は page を使わない純粋 unit test で Node 上で走るため、DOM global の
    // `KeyboardEvent` は実行時に存在しない。N handler は `(ctx) => {...}` で event を
    // 参照しないので、最小の cast オブジェクトで代替する。
    noteDef!.handler!(ctx, { key: "N" } as unknown as KeyboardEvent);

    expect(toggleCalled).toBe(1);
    expect(toastMsg).toContain("メモありフィルター");
  });
});
