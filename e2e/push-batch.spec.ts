import { test, expect } from "@playwright/test";
import { buildBatchedPushPayload, type FeedNewArticles } from "../src/cron/fetch";
import { makeArticle } from "./helpers/article";

test.describe("buildBatchedPushPayload", () => {
  test("単一フィード・単一記事の場合はフィード名と記事タイトルを表示", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle({ title: "新機能リリース" })],
        feedTitle: "Tech Blog",
        feedHash: "feed1",
      },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("Tech Blog");
    expect(payload.body).toBe("新機能リリース");
    expect(payload.url).toBe("/");
  });

  test("単一フィード・複数記事の場合は件数を表示", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle(), makeArticle({ id: "a2" }), makeArticle({ id: "a3" })],
        feedTitle: "Dev Blog",
        feedHash: "feed2",
      },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("Dev Blog");
    expect(payload.body).toBe("3 件の新着記事");
  });

  test("複数フィードの場合はフィード数を含めたサマリーを表示", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle(), makeArticle({ id: "a2" })],
        feedTitle: "Blog A",
        feedHash: "feedA",
      },
      { articles: [makeArticle({ id: "a3" })], feedTitle: "Blog B", feedHash: "feedB" },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("RSS Reader");
    expect(payload.body).toBe("3 件の新着記事（2 フィード）");
  });

  test("単一フィード・タイトル空の記事は「新着記事」フォールバック", () => {
    const entries: FeedNewArticles[] = [
      { articles: [makeArticle({ title: "" })], feedTitle: "Empty Title Feed", feedHash: "feedE" },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.body).toBe("新着記事");
  });
});
