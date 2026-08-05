import { test, expect } from "@playwright/test";
import { buildFeedTitleMap, clampSummaryText, selectArticlesByIds } from "../src/lib/export-shared";
import { makeArticle } from "./helpers/article";
import { makeFeed } from "./helpers/feed";

test.describe("selectArticlesByIds", () => {
  test("ID が一致する記事だけを入力順のまま返す", () => {
    const articles = [
      makeArticle({ id: "a1", title: "One" }),
      makeArticle({ id: "a2", title: "Two" }),
      makeArticle({ id: "a3", title: "Three" }),
    ];

    expect(selectArticlesByIds(articles, new Set(["a3", "a1"]))).toEqual([
      articles[0],
      articles[2],
    ]);
  });

  test("空の ID Set では空配列を返す", () => {
    expect(selectArticlesByIds([makeArticle({ id: "a1" })], new Set())).toEqual([]);
  });
});

test.describe("buildFeedTitleMap", () => {
  test("Feed.id → title の Map を構築する", () => {
    const feeds = [makeFeed({ id: "f1", title: "A" }), makeFeed({ id: "f2", title: "B" })];
    const map = buildFeedTitleMap(feeds);
    expect(map.get("f1")).toBe("A");
    expect(map.get("f2")).toBe("B");
  });

  test("空配列では空 Map", () => {
    expect(buildFeedTitleMap([]).size).toBe(0);
  });

  test("未登録 id は undefined (fallback は呼出側責務)", () => {
    const map = buildFeedTitleMap([makeFeed({ id: "f1", title: "A" })]);
    expect(map.get("missing")).toBeUndefined();
  });
});

test.describe("clampSummaryText", () => {
  test("HTML を除去する", () => {
    expect(clampSummaryText("<p>こんにちは<b>世界</b></p>")).toBe("こんにちは世界");
  });

  test("既定 300 文字に clamp する", () => {
    expect(clampSummaryText("あ".repeat(500))).toHaveLength(300);
  });

  test("max を指定できる", () => {
    expect(clampSummaryText("あ".repeat(500), 10)).toHaveLength(10);
  });

  test("undefined / 空文字は空文字を返す", () => {
    expect(clampSummaryText(undefined)).toBe("");
    expect(clampSummaryText("")).toBe("");
  });
});
