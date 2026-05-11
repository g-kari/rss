import { test, expect } from "@playwright/test";
import { buildProtectedIds, filterExpiredArticles, ARTICLE_TTL_DAYS } from "../src/lib/article-ttl";
import type { ReadState } from "../src/types";
import { makeArticle } from "./helpers/article";

// ── ヘルパー ───────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const EMPTY_READ_STATE: ReadState = {
  readIds: [],
  bookmarkIds: [],
  readingListIds: [],
  likeIds: [],
};

// ── buildProtectedIds ──────────────────────────────────────────────

test("buildProtectedIds: 全フィールドが空の ReadState → 空 Set を返す", () => {
  const ids = buildProtectedIds(EMPTY_READ_STATE);
  expect(ids.size).toBe(0);
});

test("buildProtectedIds: bookmarkIds が保護対象に含まれる", () => {
  const ids = buildProtectedIds({ ...EMPTY_READ_STATE, bookmarkIds: ["id1", "id2"] });
  expect(ids.has("id1")).toBe(true);
  expect(ids.has("id2")).toBe(true);
});

test("buildProtectedIds: readingListIds が保護対象に含まれる", () => {
  const ids = buildProtectedIds({ ...EMPTY_READ_STATE, readingListIds: ["id3"] });
  expect(ids.has("id3")).toBe(true);
});

test("buildProtectedIds: likeIds が保護対象に含まれる", () => {
  const ids = buildProtectedIds({ ...EMPTY_READ_STATE, likeIds: ["id4"] });
  expect(ids.has("id4")).toBe(true);
});

test("buildProtectedIds: snoozedUntil のキーが保護対象に含まれる", () => {
  const ids = buildProtectedIds({
    ...EMPTY_READ_STATE,
    snoozedUntil: { id5: daysAgo(-1) },
  });
  expect(ids.has("id5")).toBe(true);
});

test("buildProtectedIds: notes のキーが保護対象に含まれる", () => {
  const ids = buildProtectedIds({ ...EMPTY_READ_STATE, notes: { id6: "メモ" } });
  expect(ids.has("id6")).toBe(true);
});

test("buildProtectedIds: readIds のみは保護対象に含まれない", () => {
  const ids = buildProtectedIds({ ...EMPTY_READ_STATE, readIds: ["id7"] });
  expect(ids.has("id7")).toBe(false);
});

// ── filterExpiredArticles ──────────────────────────────────────────

test("filterExpiredArticles: TTL 以内の記事は保持される", () => {
  const article = makeArticle({ publishedAt: daysAgo(5) });
  const result = filterExpiredArticles([article], new Set());
  expect(result).toHaveLength(1);
});

test(`filterExpiredArticles: ${ARTICLE_TTL_DAYS}日超過 & 非保護の記事は除外される`, () => {
  const article = makeArticle({ id: "expired01", publishedAt: daysAgo(ARTICLE_TTL_DAYS + 1) });
  const result = filterExpiredArticles([article], new Set());
  expect(result).toHaveLength(0);
});

test("filterExpiredArticles: TTL 超過 & ブックマーク済み → 保持される", () => {
  const article = makeArticle({ id: "bookmarked", publishedAt: daysAgo(ARTICLE_TTL_DAYS + 1) });
  const protectedIds = new Set(["bookmarked"]);
  const result = filterExpiredArticles([article], protectedIds);
  expect(result).toHaveLength(1);
});

test("filterExpiredArticles: publishedAt が null → createdAt で判定", () => {
  const expired = makeArticle({
    id: "nocreated",
    publishedAt: null,
    createdAt: daysAgo(ARTICLE_TTL_DAYS + 1),
  });
  const fresh = makeArticle({
    id: "freshnocreated",
    publishedAt: null,
    createdAt: daysAgo(3),
  });
  const result = filterExpiredArticles([expired, fresh], new Set());
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe("freshnocreated");
});

test("filterExpiredArticles: publishedAt も createdAt も null → 保持される（安全側）", () => {
  const article = makeArticle({ publishedAt: null, createdAt: "" });
  const result = filterExpiredArticles([article], new Set());
  expect(result).toHaveLength(1);
});

test("filterExpiredArticles: 空配列 → 空配列を返す", () => {
  expect(filterExpiredArticles([], new Set())).toHaveLength(0);
});

test("filterExpiredArticles: カスタム TTL 日数を指定できる", () => {
  const article = makeArticle({ id: "custom", publishedAt: daysAgo(10) });
  const resultShort = filterExpiredArticles([article], new Set(), 7);
  const resultLong = filterExpiredArticles([article], new Set(), 30);
  expect(resultShort).toHaveLength(0);
  expect(resultLong).toHaveLength(1);
});
