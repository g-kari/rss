import { test, expect } from "@playwright/test";
import { validateSeedRequest } from "../src/lib/test-seed";

test.describe("validateSeedRequest", () => {
  test("空オブジェクトは許可（何も seed しない）", () => {
    expect(validateSeedRequest({})).toEqual({ ok: true, data: {} });
  });

  test("非オブジェクトは reject", () => {
    expect(validateSeedRequest("hello")).toEqual({
      ok: false,
      error: "body is not an object",
    });
    expect(validateSeedRequest(null)).toEqual({
      ok: false,
      error: "body is not an object",
    });
    expect(validateSeedRequest([])).toEqual({
      ok: false,
      error: "body is not an object",
    });
  });

  test("正しい feeds 配列を受理", () => {
    const result = validateSeedRequest({
      feeds: [
        {
          feedHash: "0123456789abcdef",
          meta: { title: "Test Feed" },
          articles: [{ id: "art1", title: "Article 1" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.feeds).toHaveLength(1);
  });

  test("feedHash 形式不正は reject", () => {
    const result = validateSeedRequest({
      feeds: [{ feedHash: "INVALID", meta: {}, articles: [] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("feedHash invalid");
  });

  test("articles が配列でない場合 reject", () => {
    const result = validateSeedRequest({
      feeds: [{ feedHash: "0123456789abcdef", meta: {}, articles: "not array" }],
    });
    expect(result.ok).toBe(false);
  });

  test("subscriptions の url が http(s) でない場合 reject", () => {
    const result = validateSeedRequest({
      subscriptions: [{ feedHash: "0123456789abcdef", url: "javascript:alert(1)" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("url invalid");
  });

  test("readState の各 ID 配列を受理", () => {
    const result = validateSeedRequest({
      readState: {
        readIds: ["a", "b", "c"],
        bookmarkIds: ["d"],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.readState?.readIds).toEqual(["a", "b", "c"]);
      expect(result.data.readState?.bookmarkIds).toEqual(["d"]);
    }
  });

  test("readState の ID 配列に非文字列が混じっていれば reject", () => {
    const result = validateSeedRequest({
      readState: { readIds: ["a", 123, "c"] },
    });
    expect(result.ok).toBe(false);
  });

  test("feeds 上限 50 件超過は reject", () => {
    const feeds = Array.from({ length: 51 }, () => ({
      feedHash: "0123456789abcdef",
      meta: {},
      articles: [],
    }));
    const result = validateSeedRequest({ feeds });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("feeds exceeds");
  });

  test("articles 上限 1000 件超過は reject", () => {
    const articles = Array.from({ length: 1001 }, (_, i) => ({ id: `a${i}` }));
    const result = validateSeedRequest({
      feeds: [{ feedHash: "0123456789abcdef", meta: {}, articles }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("articles exceeds");
  });

  test("readState ID 配列上限 10000 件超過は reject", () => {
    const readIds = Array.from({ length: 10001 }, (_, i) => `a${i}`);
    const result = validateSeedRequest({ readState: { readIds } });
    expect(result.ok).toBe(false);
  });

  test("複合: feeds + subscriptions + readState を同時に受理", () => {
    const result = validateSeedRequest({
      feeds: [{ feedHash: "0123456789abcdef", meta: {}, articles: [] }],
      subscriptions: [{ feedHash: "0123456789abcdef", url: "https://example.com/rss" }],
      readState: { readIds: [] },
    });
    expect(result.ok).toBe(true);
  });

  test("customTitle 未指定の subscription は受理", () => {
    const result = validateSeedRequest({
      subscriptions: [{ feedHash: "0123456789abcdef", url: "https://example.com/rss" }],
    });
    expect(result.ok).toBe(true);
  });

  test("customTitle 文字列指定は受理", () => {
    const result = validateSeedRequest({
      subscriptions: [
        { feedHash: "0123456789abcdef", url: "https://example.com/rss", customTitle: "My Feed" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  test("customTitle が文字列でないなら reject", () => {
    const result = validateSeedRequest({
      subscriptions: [
        { feedHash: "0123456789abcdef", url: "https://example.com/rss", customTitle: 42 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
