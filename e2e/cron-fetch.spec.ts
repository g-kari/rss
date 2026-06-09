import { test, expect } from "@playwright/test";
import type { SharedFeedMeta } from "../src/types";
import type { ParsedFeed } from "../src/lib/xml-parser";
import { makeArticle } from "./helpers/article";

import {
  buildBatchedPushPayload,
  buildArticle,
  applyFeedSuccess,
  applyFeedRateLimit,
  applyFeedError,
  filterDisabledFeeds,
  RateLimitError,
  type FeedNewArticles,
} from "../src/cron/fetch";

// ── テストヘルパー ─────────────────────────────────────────────────

function makeMeta(overrides: Partial<SharedFeedMeta> = {}): SharedFeedMeta {
  return {
    feedHash: "abc123def456abcd",
    url: "https://example.com/feed.xml",
    title: "Test Feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    consecutiveErrors: 0,
    lastErrorAt: null,
    rateLimitedUntil: null,
    articleCount: 0,
    pageCount: 0,
    ...overrides,
  };
}

function makeParsedFeed(overrides: Partial<ParsedFeed> = {}): ParsedFeed {
  return {
    title: "Parsed Title",
    siteUrl: "https://example.com",
    items: [],
    ...overrides,
  };
}

// ── buildBatchedPushPayload のテスト ──────────────────────────────

test.describe("buildBatchedPushPayload", () => {
  test("フィード1件・記事1件のとき: title=feedTitle, body=記事タイトル", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle({ title: "新着記事A" })],
        feedTitle: "テストフィード",
        feedHash: "abc123def456abcd",
      },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("テストフィード");
    expect(payload.body).toBe("新着記事A");
    expect(payload.url).toBe("/");
  });

  test("フィード1件・記事1件でタイトルが空のとき: body=「新着記事」フォールバック", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle({ title: "" })],
        feedTitle: "テストフィード",
        feedHash: "abc123def456abcd",
      },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.body).toBe("新着記事");
  });

  test("フィード1件・記事複数件のとき: title=feedTitle, body=「N件の新着記事」", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle(), makeArticle({ id: "b2" }), makeArticle({ id: "c3" })],
        feedTitle: "テストフィード",
        feedHash: "abc123def456abcd",
      },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("テストフィード");
    expect(payload.body).toBe("3 件の新着記事");
  });

  test("フィード複数件のとき: title=「RSS Reader」, body=「N件の新着記事（Mフィード）」", () => {
    const entries: FeedNewArticles[] = [
      {
        articles: [makeArticle(), makeArticle({ id: "b2" })],
        feedTitle: "フィードA",
        feedHash: "aaa",
      },
      {
        articles: [makeArticle({ id: "c3" })],
        feedTitle: "フィードB",
        feedHash: "bbb",
      },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("RSS Reader");
    expect(payload.body).toBe("3 件の新着記事（2 フィード）");
  });

  test("フィード複数件・合計1件のとき: title=「RSS Reader」", () => {
    const entries: FeedNewArticles[] = [
      { articles: [makeArticle()], feedTitle: "A", feedHash: "aaa" },
      { articles: [], feedTitle: "B", feedHash: "bbb" },
    ];
    const payload = buildBatchedPushPayload(entries);
    expect(payload.title).toBe("RSS Reader");
    expect(payload.body).toBe("1 件の新着記事（2 フィード）");
  });
});

// ── buildArticle のテスト ─────────────────────────────────────────

test.describe("buildArticle", () => {
  const feedHash = "abc123def456abcd";
  const feedUrl = "https://example.com/feed.xml";

  function makeParsedItem(
    overrides: {
      guid?: string;
      title?: string;
      link?: string;
      summary?: string;
      content?: string;
      ogImage?: string;
      author?: string;
      publishedAt?: string | null;
      categories?: string[];
      metadata?: Array<{ key: string; value: string }>;
    } = {},
  ) {
    return {
      guid: "https://example.com/article-1",
      title: "テスト記事",
      link: "https://example.com/article-1",
      summary: "概要",
      content: "",
      ogImage: "",
      author: "",
      publishedAt: "2026-01-01T00:00:00Z",
      categories: [],
      metadata: [],
      ...overrides,
    };
  }

  test("新規記事（existingById に存在しない）: createdAt が現在時刻付近", async () => {
    const before = Date.now();
    const item = makeParsedItem();
    const article = await buildArticle(item, feedHash, feedUrl, new Map());
    const after = Date.now();

    const createdMs = new Date(article.createdAt).getTime();
    expect(createdMs).toBeGreaterThanOrEqual(before);
    expect(createdMs).toBeLessThanOrEqual(after);
  });

  test("既存記事（existingById に存在する）: createdAt が既存値を引き継ぐ", async () => {
    const existingCreatedAt = "2025-06-15T12:00:00Z";
    const item = makeParsedItem({ guid: "https://example.com/article-1" });
    // 事前に同一 feedUrl + guid で ID を計算して existingById に入れる
    // buildArticle 内部で computeArticleId を呼ぶので、同一 feedUrl+guid なら同一 ID になる
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const id = await computeArticleId(feedUrl, item.guid);

    const existingArticle = makeArticle({
      id,
      createdAt: existingCreatedAt,
      ogImage: "https://example.com/img.jpg",
      author: "既存著者",
    });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.createdAt).toBe(existingCreatedAt);
  });

  test("ogImage: 既存値を引き継ぐ（新規アイテムが空の場合）", async () => {
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const item = makeParsedItem({ ogImage: "" });
    const id = await computeArticleId(feedUrl, item.guid);
    const existingArticle = makeArticle({ id, ogImage: "https://old-img.jpg" });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.ogImage).toBe("https://old-img.jpg");
  });

  test("ogImage: 新規アイテムに値がある場合は新しい値を使う", async () => {
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const item = makeParsedItem({ ogImage: "https://new-img.jpg" });
    const id = await computeArticleId(feedUrl, item.guid);
    const existingArticle = makeArticle({ id, ogImage: "https://old-img.jpg" });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.ogImage).toBe("https://new-img.jpg");
  });

  test("author: 既存値を引き継ぐ（新規アイテムが空の場合）", async () => {
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const item = makeParsedItem({ author: "" });
    const id = await computeArticleId(feedUrl, item.guid);
    const existingArticle = makeArticle({ id, author: "既存著者" });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.author).toBe("既存著者");
  });

  test("categories: 空でない場合は新しい値を使う", async () => {
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const item = makeParsedItem({ categories: ["tech", "news"] });
    const id = await computeArticleId(feedUrl, item.guid);
    const existingArticle = makeArticle({ id, categories: ["old-category"] });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.categories).toEqual(["tech", "news"]);
  });

  test("categories: 空の場合は既存値を引き継ぐ", async () => {
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const item = makeParsedItem({ categories: [] });
    const id = await computeArticleId(feedUrl, item.guid);
    const existingArticle = makeArticle({ id, categories: ["old-category"] });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.categories).toEqual(["old-category"]);
  });

  test("metadata: 空でない場合は新しい値を使う", async () => {
    const { computeArticleId } = await import("../src/lib/shared-feed");
    const newMeta = [{ key: "source", value: "newValue" }];
    const item = makeParsedItem({ metadata: newMeta });
    const id = await computeArticleId(feedUrl, item.guid);
    const existingArticle = makeArticle({ id, metadata: [{ key: "source", value: "oldValue" }] });
    const existingById = new Map([[id, existingArticle]]);

    const article = await buildArticle(item, feedHash, feedUrl, existingById);
    expect(article.metadata).toEqual(newMeta);
  });

  test("feedHash と基本フィールドが正しく設定される", async () => {
    const item = makeParsedItem({ title: "記事タイトル", link: "https://example.com/a" });
    const article = await buildArticle(item, feedHash, feedUrl, new Map());
    expect(article.feedHash).toBe(feedHash);
    expect(article.title).toBe("記事タイトル");
    expect(article.link).toBe("https://example.com/a");
    expect(article.guid).toBe(item.guid);
  });
});

// ── applyFeedSuccess のテスト ─────────────────────────────────────

test.describe("applyFeedSuccess", () => {
  test("タイトルが空でなければ meta.title が更新される", () => {
    const meta = makeMeta({ title: "旧タイトル" });
    const parsed = makeParsedFeed({ title: "新タイトル" });
    applyFeedSuccess(meta, parsed);
    expect(meta.title).toBe("新タイトル");
  });

  test("タイトルが空文字の場合は meta.title が変わらない", () => {
    const meta = makeMeta({ title: "既存タイトル" });
    const parsed = makeParsedFeed({ title: "" });
    applyFeedSuccess(meta, parsed);
    expect(meta.title).toBe("既存タイトル");
  });

  test("fetchError が null になる", () => {
    const meta = makeMeta({ fetchError: "以前のエラー" });
    applyFeedSuccess(meta, makeParsedFeed());
    expect(meta.fetchError).toBeNull();
  });

  test("consecutiveErrors が 0 になる", () => {
    const meta = makeMeta({ consecutiveErrors: 3 });
    applyFeedSuccess(meta, makeParsedFeed());
    expect(meta.consecutiveErrors).toBe(0);
  });

  test("rateLimitedUntil が null になる", () => {
    const meta = makeMeta({ rateLimitedUntil: "2030-01-01T00:00:00Z" });
    applyFeedSuccess(meta, makeParsedFeed());
    expect(meta.rateLimitedUntil).toBeNull();
  });

  test("lastErrorAt が null になる", () => {
    const meta = makeMeta({ lastErrorAt: "2026-01-01T00:00:00Z" });
    applyFeedSuccess(meta, makeParsedFeed());
    expect(meta.lastErrorAt).toBeNull();
  });

  test("lastFetchedAt が現在時刻付近のISO文字列に更新される", () => {
    const before = Date.now();
    const meta = makeMeta({ lastFetchedAt: null });
    applyFeedSuccess(meta, makeParsedFeed());
    const after = Date.now();

    expect(meta.lastFetchedAt).not.toBeNull();
    const fetchedMs = new Date(meta.lastFetchedAt!).getTime();
    expect(fetchedMs).toBeGreaterThanOrEqual(before);
    expect(fetchedMs).toBeLessThanOrEqual(after);
  });

  test("siteUrl が空でなければ更新される", () => {
    const meta = makeMeta({ siteUrl: "https://old.example.com" });
    const parsed = makeParsedFeed({ siteUrl: "https://new.example.com" });
    applyFeedSuccess(meta, parsed);
    expect(meta.siteUrl).toBe("https://new.example.com");
  });

  test("siteUrl が空文字の場合は変わらない", () => {
    const meta = makeMeta({ siteUrl: "https://old.example.com" });
    const parsed = makeParsedFeed({ siteUrl: "" });
    applyFeedSuccess(meta, parsed);
    expect(meta.siteUrl).toBe("https://old.example.com");
  });
});

// ── applyFeedRateLimit のテスト ───────────────────────────────────

test.describe("applyFeedRateLimit", () => {
  test("rateLimitedUntil が未来の ISO 文字列に設定される", () => {
    const meta = makeMeta();
    const retryAfterMs = 60 * 60 * 1000; // 1 時間
    const before = Date.now();
    const error = new RateLimitError(retryAfterMs);
    applyFeedRateLimit(meta, error);
    const after = Date.now();

    expect(meta.rateLimitedUntil).not.toBeNull();
    const rateLimitedMs = new Date(meta.rateLimitedUntil!).getTime();
    // before + retryAfterMs 〜 after + retryAfterMs の範囲内
    expect(rateLimitedMs).toBeGreaterThanOrEqual(before + retryAfterMs);
    expect(rateLimitedMs).toBeLessThanOrEqual(after + retryAfterMs);
  });

  test("fetchError がエラーメッセージになる", () => {
    const meta = makeMeta({ fetchError: null });
    const error = new RateLimitError(3600_000);
    applyFeedRateLimit(meta, error);
    expect(meta.fetchError).toBeTruthy();
    expect(meta.fetchError).toContain("Rate limited");
  });

  test("短い retryAfterMs でも rateLimitedUntil が未来を指す", () => {
    const meta = makeMeta();
    const before = Date.now();
    const error = new RateLimitError(1000); // 1 秒
    applyFeedRateLimit(meta, error);

    const rateLimitedMs = new Date(meta.rateLimitedUntil!).getTime();
    expect(rateLimitedMs).toBeGreaterThan(before);
  });
});

// ── applyFeedError のテスト ───────────────────────────────────────

test.describe("applyFeedError", () => {
  test("consecutiveErrors がインクリメントされる", () => {
    const meta = makeMeta({ consecutiveErrors: 2 });
    applyFeedError(meta, new Error("Network error"));
    expect(meta.consecutiveErrors).toBe(3);
  });

  test("consecutiveErrors が 0 から始まる場合は 1 になる", () => {
    const meta = makeMeta({ consecutiveErrors: 0 });
    applyFeedError(meta, new Error("error"));
    expect(meta.consecutiveErrors).toBe(1);
  });

  test("consecutiveErrors が undefined の場合は 1 になる", () => {
    const meta = makeMeta();
    delete (meta as Partial<SharedFeedMeta>).consecutiveErrors;
    applyFeedError(meta, new Error("error"));
    expect(meta.consecutiveErrors).toBe(1);
  });

  test("consecutiveErrors が上限（5）を超えない", () => {
    const meta = makeMeta({ consecutiveErrors: 5 });
    applyFeedError(meta, new Error("error"));
    expect(meta.consecutiveErrors).toBe(5);
  });

  test("上限未満（4）から適用するとちょうど 5 になる", () => {
    const meta = makeMeta({ consecutiveErrors: 4 });
    applyFeedError(meta, new Error("error"));
    expect(meta.consecutiveErrors).toBe(5);
  });

  test("fetchError がエラーメッセージに設定される", () => {
    const meta = makeMeta({ fetchError: null });
    applyFeedError(meta, new Error("Connection timeout"));
    expect(meta.fetchError).toBeTruthy();
    expect(typeof meta.fetchError).toBe("string");
  });

  test("lastErrorAt が現在時刻付近の ISO 文字列に設定される", () => {
    const before = Date.now();
    const meta = makeMeta({ lastErrorAt: null });
    applyFeedError(meta, new Error("error"));
    const after = Date.now();

    expect(meta.lastErrorAt).not.toBeNull();
    const errorMs = new Date(meta.lastErrorAt!).getTime();
    expect(errorMs).toBeGreaterThanOrEqual(before);
    expect(errorMs).toBeLessThanOrEqual(after);
  });

  test("Error 以外のオブジェクト（文字列）でも fetchError が設定される", () => {
    const meta = makeMeta({ fetchError: null });
    applyFeedError(meta, "string error");
    expect(meta.fetchError).toBeTruthy();
  });

  test("Error 以外のオブジェクト（null）でも fetchError が設定される", () => {
    const meta = makeMeta({ fetchError: null });
    applyFeedError(meta, null);
    expect(meta.fetchError).toBeTruthy();
  });
});

test.describe("filterDisabledFeeds", () => {
  const mk = (feedHash: string): FeedNewArticles => ({
    feedHash,
    feedTitle: `feed-${feedHash}`,
    articles: [],
  });

  test("disabledFeeds が undefined のとき全件返す", () => {
    const feeds = [mk("a"), mk("b")];
    expect(filterDisabledFeeds(feeds, undefined)).toEqual(feeds);
  });

  test("disabledFeeds で true の feedHash を除外する", () => {
    const feeds = [mk("a"), mk("b"), mk("c")];
    const result = filterDisabledFeeds(feeds, { b: true });
    expect(result.map((f) => f.feedHash)).toEqual(["a", "c"]);
  });

  test("disabledFeeds で false の feedHash は除外しない", () => {
    const feeds = [mk("a"), mk("b")];
    const result = filterDisabledFeeds(feeds, { b: false });
    expect(result.map((f) => f.feedHash)).toEqual(["a", "b"]);
  });

  test("error feed 経路でも同じフィルタが効く (新着・エラー両経路の対称性)", () => {
    // error push は { feedHash, feedTitle } で渡る → 同 helper で OFF フィードを除外できる
    const errorFeeds = [mk("x"), mk("disabled-feed")];
    const result = filterDisabledFeeds(errorFeeds, { "disabled-feed": true });
    expect(result.map((f) => f.feedHash)).toEqual(["x"]);
  });
});
