import { test, expect } from "@playwright/test";
import { getFeedViewStorageKey } from "../src/lib/storage";

test.describe("getFeedViewStorageKey", () => {
  test("articles ビューはサフィックスなし（既存キーとの後方互換）", () => {
    expect(getFeedViewStorageKey("rss-unread-only", "articles")).toBe("rss-unread-only");
    expect(getFeedViewStorageKey("rss-date-range", "articles")).toBe("rss-date-range");
  });

  test("pictures ビューは :pictures サフィックス", () => {
    expect(getFeedViewStorageKey("rss-unread-only", "pictures")).toBe("rss-unread-only:pictures");
    expect(getFeedViewStorageKey("rss-bookmark-only", "pictures")).toBe(
      "rss-bookmark-only:pictures",
    );
  });

  test("videos ビューは :videos サフィックス", () => {
    expect(getFeedViewStorageKey("rss-unread-only", "videos")).toBe("rss-unread-only:videos");
  });

  test("social ビューは :social サフィックス", () => {
    expect(getFeedViewStorageKey("rss-unread-only", "social")).toBe("rss-unread-only:social");
  });

  test("空文字列キーは空のままサフィックスのみ付与（articles を除く）", () => {
    expect(getFeedViewStorageKey("", "articles")).toBe("");
    expect(getFeedViewStorageKey("", "pictures")).toBe(":pictures");
  });
});
