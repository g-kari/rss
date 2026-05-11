import { test, expect } from "@playwright/test";
import { isArticleMutated } from "../src/lib/shared-feed";
import { makeArticle } from "./helpers/article";

/**
 * isArticleMutated の単体テスト。
 *
 * Issue #97: mergeNewArticles が変更なしでも毎回 R2 PUT を発生させる問題の
 * 回帰テスト。createdAt は呼び出し側で保持されるため比較対象外。
 */

test("isArticleMutated: 全フィールド同一なら false", () => {
  const ex = makeArticle();
  const incoming = makeArticle();
  expect(isArticleMutated(ex, incoming)).toBe(false);
});

test("isArticleMutated: title が異なれば true", () => {
  const ex = makeArticle();
  const incoming = makeArticle({ title: "Changed" });
  expect(isArticleMutated(ex, incoming)).toBe(true);
});

test("isArticleMutated: summary / link / content が異なれば true", () => {
  const ex = makeArticle({ content: "old" });
  expect(isArticleMutated(ex, makeArticle({ content: "new" }))).toBe(true);
  expect(isArticleMutated(ex, makeArticle({ content: "old", link: "https://x" }))).toBe(true);
  expect(isArticleMutated(ex, makeArticle({ content: "old", summary: "s2" }))).toBe(true);
});

test("isArticleMutated: createdAt の差分は無視する", () => {
  const ex = makeArticle({ createdAt: "2026-01-01T00:00:00Z" });
  const incoming = makeArticle({ createdAt: "2026-09-09T00:00:00Z" });
  expect(isArticleMutated(ex, incoming)).toBe(false);
});

test("isArticleMutated: categories undefined -> 値ありで true", () => {
  const ex = makeArticle();
  const incoming = makeArticle({ categories: ["tech"] });
  expect(isArticleMutated(ex, incoming)).toBe(true);
});

test("isArticleMutated: 同じ categories 配列なら false", () => {
  const ex = makeArticle({ categories: ["tech", "news"] });
  const incoming = makeArticle({ categories: ["tech", "news"] });
  expect(isArticleMutated(ex, incoming)).toBe(false);
});

test("isArticleMutated: categories の順序違いは true", () => {
  const ex = makeArticle({ categories: ["tech", "news"] });
  const incoming = makeArticle({ categories: ["news", "tech"] });
  expect(isArticleMutated(ex, incoming)).toBe(true);
});

test("isArticleMutated: metadata の値が違えば true", () => {
  const ex = makeArticle({ metadata: [{ key: "source", value: "A" }] });
  const incoming = makeArticle({ metadata: [{ key: "source", value: "B" }] });
  expect(isArticleMutated(ex, incoming)).toBe(true);
});

test("isArticleMutated: metadata が同一なら false", () => {
  const ex = makeArticle({ metadata: [{ key: "source", value: "A" }] });
  const incoming = makeArticle({ metadata: [{ key: "source", value: "A" }] });
  expect(isArticleMutated(ex, incoming)).toBe(false);
});

test("isArticleMutated: publishedAt null -> 値ありで true", () => {
  const ex = makeArticle({ publishedAt: null });
  const incoming = makeArticle({ publishedAt: "2026-01-01T00:00:00Z" });
  expect(isArticleMutated(ex, incoming)).toBe(true);
});

test("isArticleMutated: ogImage / author の差分も検出", () => {
  const ex = makeArticle({ ogImage: "https://img/a", author: "Alice" });
  expect(isArticleMutated(ex, makeArticle({ ogImage: "https://img/b", author: "Alice" }))).toBe(
    true,
  );
  expect(isArticleMutated(ex, makeArticle({ ogImage: "https://img/a", author: "Bob" }))).toBe(true);
});
