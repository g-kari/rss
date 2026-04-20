import { test, expect } from "@playwright/test";
import { parseTagIds, MAX_TAG_NAME_LENGTH, MAX_TAGS_PER_ARTICLE } from "../src/lib/validation";

/**
 * parseTagIds の単体テスト。
 * issue #103: 記事タグ機能のサーバー側入力バリデーション。
 */

test("有効な tagIds をそのまま返す", () => {
  const result = parseTagIds({ a: ["work", "urgent"], b: ["hobby"] });
  expect(result).toEqual({ a: ["work", "urgent"], b: ["hobby"] });
});

test("不正な入力型は null を返す", () => {
  expect(parseTagIds(null)).toBeNull();
  expect(parseTagIds(undefined)).toBeNull();
  expect(parseTagIds("string")).toBeNull();
  expect(parseTagIds(["array"])).toBeNull();
  expect(parseTagIds(42)).toBeNull();
});

test("値が配列でないキーはスキップする", () => {
  const result = parseTagIds({ a: "not-array", b: ["ok"] });
  expect(result).toEqual({ b: ["ok"] });
});

test("制御文字を除去して trim する", () => {
  const result = parseTagIds({ a: ["  work\u0001  ", "\u0000urgent\u007F"] });
  expect(result).toEqual({ a: ["work", "urgent"] });
});

test("空文字・空白のみのタグは除去される", () => {
  const result = parseTagIds({ a: ["", "   ", "ok"] });
  expect(result).toEqual({ a: ["ok"] });
});

test("重複タグは排除される（同一キー内）", () => {
  const result = parseTagIds({ a: ["work", "work", "work"] });
  expect(result).toEqual({ a: ["work"] });
});

test(`MAX_TAG_NAME_LENGTH（${MAX_TAG_NAME_LENGTH}）超のタグ名は除外される`, () => {
  const long = "a".repeat(MAX_TAG_NAME_LENGTH + 1);
  const result = parseTagIds({ a: [long, "ok"] });
  expect(result).toEqual({ a: ["ok"] });
});

test(`MAX_TAGS_PER_ARTICLE（${MAX_TAGS_PER_ARTICLE}）件超は切り詰められる`, () => {
  const tags = Array.from({ length: MAX_TAGS_PER_ARTICLE + 5 }, (_, i) => `tag${i}`);
  const result = parseTagIds({ a: tags });
  expect(result?.a).toHaveLength(MAX_TAGS_PER_ARTICLE);
});

test("全タグが無効なキーは結果から除外される", () => {
  const result = parseTagIds({ a: ["", "   "], b: ["ok"] });
  expect(result).toEqual({ b: ["ok"] });
});

test("maxArticles を超える記事数は切り詰められる", () => {
  const input: Record<string, string[]> = {};
  for (let i = 0; i < 5; i++) input[`a${i}`] = ["tag"];
  const result = parseTagIds(input, 3);
  expect(result && Object.keys(result).length).toBe(3);
});

test("key が長すぎる場合はスキップする", () => {
  const longKey = "a".repeat(200);
  const result = parseTagIds({ [longKey]: ["tag"], ok: ["tag"] });
  expect(result).toEqual({ ok: ["tag"] });
});

test("全キーが無効な場合は null を返す", () => {
  const result = parseTagIds({ a: [], b: ["", "   "] });
  expect(result).toBeNull();
});
