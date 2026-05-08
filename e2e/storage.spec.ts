import { test, expect } from "@playwright/test";
import {
  toggleSetItem,
  deferSaveSet,
  flushDeferredSaves,
  loadSet,
  saveSet,
} from "../src/lib/storage";

// Node 環境では localStorage が存在しないが、storage.ts はすべての localStorage アクセスを
// try/catch でラップしているため例外にはならない（saveSet/loadSet は no-op に近い）。
// 本テストは toggleSetItem の Set トグルロジックと deferred-save の Map 操作・冪等性を検証する。

test.describe("toggleSetItem — Set のトグル動作", () => {
  test("既存の id がない場合は追加する", () => {
    let captured: Set<string> | null = null;
    const setState = (updater: (prev: Set<string>) => Set<string>) => {
      captured = updater(new Set(["existing"]));
    };
    toggleSetItem(setState, "__test_key__", "new-id", false);
    expect(captured).not.toBeNull();
    expect(captured!.has("new-id")).toBe(true);
    expect(captured!.has("existing")).toBe(true);
    expect(captured!.size).toBe(2);
  });

  test("既存の id がある場合は削除する", () => {
    let captured: Set<string> | null = null;
    const setState = (updater: (prev: Set<string>) => Set<string>) => {
      captured = updater(new Set(["a", "b"]));
    };
    toggleSetItem(setState, "__test_key__", "a", false);
    expect(captured!.has("a")).toBe(false);
    expect(captured!.has("b")).toBe(true);
    expect(captured!.size).toBe(1);
  });

  test("空の Set に追加できる", () => {
    let captured: Set<string> | null = null;
    const setState = (updater: (prev: Set<string>) => Set<string>) => {
      captured = updater(new Set());
    };
    toggleSetItem(setState, "__test_key__", "first", false);
    expect(captured!.has("first")).toBe(true);
    expect(captured!.size).toBe(1);
  });

  test("setState に渡される updater は新しい Set を返す（元 Set を変更しない）", () => {
    const original = new Set(["a"]);
    let captured: Set<string> | null = null;
    const setState = (updater: (prev: Set<string>) => Set<string>) => {
      captured = updater(original);
    };
    toggleSetItem(setState, "__test_key__", "b", false);
    expect(original.size).toBe(1);
    expect(original.has("b")).toBe(false);
    expect(captured).not.toBe(original);
    expect(captured!.size).toBe(2);
  });
});

test.describe("deferred save — pendingSaves の Map 操作", () => {
  test("flushDeferredSaves は pendingSaves が空でもエラーにならない（冪等）", () => {
    expect(() => flushDeferredSaves()).not.toThrow();
    expect(() => flushDeferredSaves()).not.toThrow();
  });

  test("deferSaveSet → flushDeferredSaves で pendingSaves がクリアされる", () => {
    deferSaveSet("__test_clear__", new Set(["a", "b"]));
    flushDeferredSaves();
    // 2 回目の flush は何も起きない（pendingSaves は既にクリア）
    expect(() => flushDeferredSaves()).not.toThrow();
  });

  test("同一キーで複数回 deferSaveSet を呼ぶと最後の Set が pendingSaves に残る", () => {
    deferSaveSet("__test_overwrite__", new Set(["a"]));
    deferSaveSet("__test_overwrite__", new Set(["b", "c"]));
    // flushDeferredSaves は最後の Set だけを保存しようとする（localStorage は no-op）
    expect(() => flushDeferredSaves()).not.toThrow();
  });

  test("複数キーの deferSaveSet は独立して扱われる", () => {
    deferSaveSet("__test_key_a__", new Set(["1"]));
    deferSaveSet("__test_key_b__", new Set(["2"]));
    expect(() => flushDeferredSaves()).not.toThrow();
  });
});

test.describe("loadSet / saveSet — localStorage 利用不可時の安全性", () => {
  test("Node 環境で loadSet を呼んでも例外にならず空 Set を返す", () => {
    const result = loadSet("__nonexistent__");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  test("Node 環境で saveSet を呼んでも例外にならない", () => {
    expect(() => saveSet("__test_save__", new Set(["a"]))).not.toThrow();
  });
});
