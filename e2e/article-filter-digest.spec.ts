import { test, expect } from "@playwright/test";
import { applyStateFilterAndSort, type StateFilterOptions } from "../src/lib/article-filter";
import type { Article } from "../src/types";

function makeArticle(id: string, feedHash: string, publishedAt?: string): Article {
  return {
    id,
    feedHash,
    guid: id,
    title: `記事 ${id}`,
    link: `https://example.com/${id}`,
    summary: `サマリー ${id}`,
    publishedAt: publishedAt ?? "2024-06-01T00:00:00Z",
    createdAt: publishedAt ?? "2024-06-01T00:00:00Z",
  };
}

const BASE_STATE_OPTS: StateFilterOptions = {
  feedId: null,
  readIds: new Set(),
  bookmarkIds: new Set(),
  readingListIds: new Set(),
  likeIds: new Set(),
  unreadOnly: false,
  bookmarkOnly: false,
  readingListOnly: false,
  likeOnly: false,
  noteOnly: false,
  noteIds: new Set(),
  sortOrder: "newest",
  activeIds: new Set(),
  readBeforeTimestamp: null,
  historyOrder: [],
};

// フィード A の記事を 5 件、フィード B の記事を 4 件用意
const FEED_A = "feed-a";
const FEED_B = "feed-b";

const articles: Article[] = [
  makeArticle("a1", FEED_A, "2024-06-05T00:00:00Z"),
  makeArticle("a2", FEED_A, "2024-06-04T00:00:00Z"),
  makeArticle("a3", FEED_A, "2024-06-03T00:00:00Z"),
  makeArticle("a4", FEED_A, "2024-06-02T00:00:00Z"),
  makeArticle("a5", FEED_A, "2024-06-01T00:00:00Z"),
  makeArticle("b1", FEED_B, "2024-06-05T00:00:00Z"),
  makeArticle("b2", FEED_B, "2024-06-04T00:00:00Z"),
  makeArticle("b3", FEED_B, "2024-06-03T00:00:00Z"),
  makeArticle("b4", FEED_B, "2024-06-02T00:00:00Z"),
];

test("digestMode が false のときはフィルタされない", () => {
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: false,
  });
  expect(result.length).toBe(articles.length);
});

test("digestMode: true, digestLimitMap なし → デフォルト 3 件に絞られる", () => {
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
  });
  // フィード A 3 件 + フィード B 3 件 = 6 件
  expect(result.length).toBe(6);
  const aIds = result.filter((a) => a.feedHash === FEED_A).map((a) => a.id);
  const bIds = result.filter((a) => a.feedHash === FEED_B).map((a) => a.id);
  expect(aIds).toEqual(["a1", "a2", "a3"]);
  expect(bIds).toEqual(["b1", "b2", "b3"]);
});

test("digestMode: true, digestLimitMap で FEED_A を 5 件に設定 → 5 件表示", () => {
  const digestLimitMap = new Map([[FEED_A, 5]]);
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
    digestLimitMap,
  });
  // フィード A 5 件 + フィード B 3 件（デフォルト）= 8 件
  expect(result.length).toBe(8);
  const aIds = result.filter((a) => a.feedHash === FEED_A).map((a) => a.id);
  expect(aIds).toEqual(["a1", "a2", "a3", "a4", "a5"]);
});

test("digestMode: true, digestLimitMap で FEED_B を 1 件に設定 → 1 件表示", () => {
  const digestLimitMap = new Map([[FEED_B, 1]]);
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
    digestLimitMap,
  });
  // フィード A 3 件 + フィード B 1 件 = 4 件
  expect(result.length).toBe(4);
  const bIds = result.filter((a) => a.feedHash === FEED_B).map((a) => a.id);
  expect(bIds).toEqual(["b1"]);
});

test("digestMode: true, digestLimit = 0 → 全件表示（フィルタなし）", () => {
  const digestLimitMap = new Map([[FEED_A, 0]]);
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
    digestLimitMap,
  });
  // フィード A 全 5 件 + フィード B デフォルト 3 件 = 8 件
  expect(result.length).toBe(8);
  const aIds = result.filter((a) => a.feedHash === FEED_A).map((a) => a.id);
  expect(aIds).toEqual(["a1", "a2", "a3", "a4", "a5"]);
});

test("activeIds の記事はダイジスト上限に関わらず常に含まれる", () => {
  // a4 が activeIds に含まれていても上限 3 のデフォルトを超えて表示される
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
    activeIds: new Set(["a4"]),
  });
  // フィード A: a1, a2, a3（上限3）+ a4（active）= 4 件
  // フィード B: b1, b2, b3 = 3 件
  // 合計 7 件
  expect(result.length).toBe(7);
  expect(result.some((a) => a.id === "a4")).toBe(true);
});
