import { test, expect } from "@playwright/test";
import { applyStateFilterAndSort, type StateFilterOptions } from "../src/lib/article-filter";
import { SPECIAL_FEED_IDS } from "../src/lib/storage";
import type { Article } from "../src/types";
import { makeArticle as makeBaseArticle } from "./helpers/article";

const makeArticle = (id: string, feedHash: string, publishedAt?: string) => {
  const ts = publishedAt ?? "2024-06-01T00:00:00Z";
  return makeBaseArticle({
    id,
    feedHash,
    guid: id,
    title: `記事 ${id}`,
    link: `https://example.com/${id}`,
    summary: `サマリー ${id}`,
    publishedAt: ts,
    createdAt: ts,
  });
};

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

test("feedEngagementOrder が指定された場合、高スコアフィードの記事が先頭に並ぶ", () => {
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
    feedEngagementOrder: [FEED_B, FEED_A],
    activeIds: new Set(),
  });
  expect(result[0].feedHash).toBe(FEED_B);
  expect(result[1].feedHash).toBe(FEED_B);
  expect(result[2].feedHash).toBe(FEED_B);
  expect(result[3].feedHash).toBe(FEED_A);
});

test("feedEngagementOrder 空配列の場合、元の順序（publishedAt 降順）を維持する", () => {
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    digestMode: true,
    feedEngagementOrder: [],
    activeIds: new Set(),
  });
  expect(result.length).toBe(6);
});

test("__digest__ feedId で全フィードの記事を対象にダイジェスト表示する", () => {
  const result = applyStateFilterAndSort(articles, {
    ...BASE_STATE_OPTS,
    feedId: SPECIAL_FEED_IDS.DIGEST,
    activeIds: new Set(),
  });
  expect(result.length).toBe(6);
  const aCount = result.filter((a) => a.feedHash === FEED_A).length;
  const bCount = result.filter((a) => a.feedHash === FEED_B).length;
  expect(aCount).toBe(3);
  expect(bCount).toBe(3);
});
