import { test, expect } from "@playwright/test";
import { applyStateFilterAndSort, type StateFilterOptions } from "../src/lib/article-filter";
import { SPECIAL_FEED_IDS } from "../src/lib/storage";
import { makeArticle as makeBaseArticle } from "./helpers/article";

const makeArticle = (id: string, feedHash: string, publishedAt = "2026-05-01T00:00:00Z") =>
  makeBaseArticle({
    id,
    feedHash,
    guid: id,
    title: `${id} title`,
    link: `https://example.com/${id}`,
    publishedAt,
    createdAt: publishedAt,
  });

function baseOpts(overrides: Partial<StateFilterOptions> = {}): StateFilterOptions {
  return {
    feedId: SPECIAL_FEED_IDS.DIGEST,
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
    digestMode: true,
    ...overrides,
  };
}

test.describe("ダイジェスト時に既読は digestLimit カウントから除外される（#620 Option A）", () => {
  test("全記事が未読なら従来通り digestLimit (3) で打ち切り", () => {
    const articles = [
      makeArticle("a1", "feed-A"),
      makeArticle("a2", "feed-A"),
      makeArticle("a3", "feed-A"),
      makeArticle("a4", "feed-A"), // これは未表示
      makeArticle("a5", "feed-A"), // これは未表示
    ];
    const result = applyStateFilterAndSort(articles, baseOpts());
    expect(result.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
  });

  test("既読記事はカウントせず、未読が 3 件確保される", () => {
    // a1 と a2 が既読でも、未読 a3/a4/a5 が 3 件分通る
    const articles = [
      makeArticle("a1", "feed-A"),
      makeArticle("a2", "feed-A"),
      makeArticle("a3", "feed-A"),
      makeArticle("a4", "feed-A"),
      makeArticle("a5", "feed-A"),
    ];
    const result = applyStateFilterAndSort(articles, baseOpts({ readIds: new Set(["a1", "a2"]) }));
    // 既読 a1, a2 + 未読 3 件 (a3, a4, a5) = 計 5 件
    expect(result.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
  });

  test("全記事が既読なら全件通過（既読は digestLimit を超えても表示）", () => {
    const articles = [
      makeArticle("a1", "feed-A"),
      makeArticle("a2", "feed-A"),
      makeArticle("a3", "feed-A"),
      makeArticle("a4", "feed-A"),
      makeArticle("a5", "feed-A"),
    ];
    const result = applyStateFilterAndSort(
      articles,
      baseOpts({ readIds: new Set(["a1", "a2", "a3", "a4", "a5"]) }),
    );
    expect(result.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
  });

  test("既読フィードを越えて他フィードの未読が表示される", () => {
    // feed-A: 全て既読、feed-B: 未読 5 件
    const articles = [
      makeArticle("a1", "feed-A"),
      makeArticle("a2", "feed-A"),
      makeArticle("a3", "feed-A"),
      makeArticle("b1", "feed-B"),
      makeArticle("b2", "feed-B"),
      makeArticle("b3", "feed-B"),
      makeArticle("b4", "feed-B"), // 4 件目は表示外
    ];
    const result = applyStateFilterAndSort(
      articles,
      baseOpts({ readIds: new Set(["a1", "a2", "a3"]) }),
    );
    // feed-A 既読 3 件 + feed-B 未読 3 件 = 計 6 件、b4 は除外
    expect(result.map((a) => a.id)).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
  });

  test("readBeforeTimestamp で一括既読扱いの記事もカウント外", () => {
    // 古い記事は readBeforeTimestamp により既読扱い
    const articles = [
      makeArticle("old1", "feed-A", "2026-01-01T00:00:00Z"),
      makeArticle("old2", "feed-A", "2026-01-02T00:00:00Z"),
      makeArticle("new1", "feed-A", "2026-05-01T00:00:00Z"),
      makeArticle("new2", "feed-A", "2026-05-02T00:00:00Z"),
      makeArticle("new3", "feed-A", "2026-05-03T00:00:00Z"),
      makeArticle("new4", "feed-A", "2026-05-04T00:00:00Z"),
    ];
    const result = applyStateFilterAndSort(
      articles,
      baseOpts({ readBeforeTimestamp: "2026-04-01T00:00:00Z" }),
    );
    // old1/old2 は既読扱いで通過、new1〜new3 が未読 3 件、new4 は除外
    expect(result.map((a) => a.id).sort()).toEqual(["new1", "new2", "new3", "old1", "old2"].sort());
  });

  test("activeIds は常に表示される（grace period 中の既読も含む）", () => {
    const articles = [
      makeArticle("a1", "feed-A"),
      makeArticle("a2", "feed-A"),
      makeArticle("a3", "feed-A"),
      makeArticle("a4", "feed-A"),
    ];
    const result = applyStateFilterAndSort(
      articles,
      baseOpts({
        activeIds: new Set(["a4"]), // a4 を保持
        readIds: new Set(["a1"]),
      }),
    );
    // a1（既読・通過）+ a2/a3（未読 2 件）+ a4（activeIds 通過、未読カウント未確認）
    // activeIds 経由なので a4 は通過、count はそのまま
    expect(result.map((a) => a.id)).toContain("a4");
  });
});
