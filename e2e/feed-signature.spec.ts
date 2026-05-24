import { test, expect } from "@playwright/test";
import {
  computeArticleTagIdsSignature,
  computeFeedStructuralSignature,
} from "../src/lib/feed-signature";
import type { Feed } from "../src/types";

/**
 * `computeFeedStructuralSignature` 純粋関数のテスト (#789)。
 *
 * feeds reference が 5 分 polling で毎回新しくなる状況で、構造的内容変化なしなら
 * 同一 signature を返して下流の useMemo を再計算 skip させる役割。
 *
 * `useSidebarFeeds.ts` と `useFeedSidebarActions.ts` の両方で sidebar layout 派生に
 * 影響する全 field (id / title / category / groupId / nsfw / priority / view) を encode する。
 */

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "feed-1",
    url: "https://example.com/feed.xml",
    title: "Example Feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    ...overrides,
  };
}

test.describe("computeFeedStructuralSignature — 基本", () => {
  test("空配列で空文字列を返す", () => {
    expect(computeFeedStructuralSignature([])).toBe("");
  });

  test("1 件 feed の signature が全 field 値を含む", () => {
    const feed = makeFeed({
      id: "id-1",
      title: "Title",
      category: "tech",
      groupId: "group-1",
      nsfw: true,
      priority: "high",
      view: "articles",
    });
    const sig = computeFeedStructuralSignature([feed]);
    expect(sig).toBe("id-1|Title|tech|group-1|1|high|articles");
  });

  test("同一内容で同 signature (reference 違いでも内容一致なら同等)", () => {
    const feedsA = [makeFeed({ id: "a" }), makeFeed({ id: "b" })];
    const feedsB = [makeFeed({ id: "a" }), makeFeed({ id: "b" })];
    expect(computeFeedStructuralSignature(feedsA)).toBe(computeFeedStructuralSignature(feedsB));
  });

  test("複数 feeds は改行区切りで連結される", () => {
    const sig = computeFeedStructuralSignature([
      makeFeed({ id: "a", title: "A" }),
      makeFeed({ id: "b", title: "B" }),
    ]);
    expect(sig).toBe("a|A|||0||\nb|B|||0||");
  });
});

test.describe("computeFeedStructuralSignature — field 変化検知", () => {
  test("id 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ id: "x" })]);
    const b = computeFeedStructuralSignature([makeFeed({ id: "y" })]);
    expect(a).not.toBe(b);
  });

  test("title 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ title: "X" })]);
    const b = computeFeedStructuralSignature([makeFeed({ title: "Y" })]);
    expect(a).not.toBe(b);
  });

  test("category 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ category: "tech" })]);
    const b = computeFeedStructuralSignature([makeFeed({ category: "news" })]);
    expect(a).not.toBe(b);
  });

  test("groupId 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ groupId: "g1" })]);
    const b = computeFeedStructuralSignature([makeFeed({ groupId: "g2" })]);
    expect(a).not.toBe(b);
  });

  test("nsfw 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ nsfw: true })]);
    const b = computeFeedStructuralSignature([makeFeed({ nsfw: false })]);
    expect(a).not.toBe(b);
  });

  test("priority 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ priority: "high" })]);
    const b = computeFeedStructuralSignature([makeFeed({ priority: undefined })]);
    expect(a).not.toBe(b);
  });

  test("view 変化で signature 変化", () => {
    const a = computeFeedStructuralSignature([makeFeed({ view: "articles" })]);
    const b = computeFeedStructuralSignature([makeFeed({ view: "pictures" })]);
    expect(a).not.toBe(b);
  });
});

test.describe("computeFeedStructuralSignature — 順序 / 非影響 field", () => {
  test("順序差異で signature 変化 (順序依存)", () => {
    const a = computeFeedStructuralSignature([makeFeed({ id: "a" }), makeFeed({ id: "b" })]);
    const b = computeFeedStructuralSignature([makeFeed({ id: "b" }), makeFeed({ id: "a" })]);
    expect(a).not.toBe(b);
  });

  test("lastFetchedAt 等 sidebar 非影響 field 変化で signature 不変", () => {
    const a = computeFeedStructuralSignature([
      makeFeed({ id: "x", title: "T", lastFetchedAt: "2026-01-01T00:00:00Z" }),
    ]);
    const b = computeFeedStructuralSignature([
      makeFeed({ id: "x", title: "T", lastFetchedAt: "2026-05-17T00:00:00Z" }),
    ]);
    expect(a).toBe(b);
  });

  test("title null は空文字列扱い (オプショナル field)", () => {
    const sig = computeFeedStructuralSignature([makeFeed({ id: "x", title: undefined })]);
    expect(sig).toBe("x||||0||");
  });
});

test.describe("computeArticleTagIdsSignature", () => {
  test("空の articleTagIds は空文字を返す", () => {
    expect(computeArticleTagIdsSignature({})).toBe("");
  });

  test("単一 article + 単一 tag", () => {
    expect(computeArticleTagIdsSignature({ "art-1": ["tag-a"] })).toBe("art-1|tag-a");
  });

  test("単一 article + 複数 tag は `,` で join される", () => {
    expect(computeArticleTagIdsSignature({ "art-1": ["tag-a", "tag-b", "tag-c"] })).toBe(
      "art-1|tag-a,tag-b,tag-c",
    );
  });

  test("複数 article entry は `\\n` で join される", () => {
    expect(
      computeArticleTagIdsSignature({
        "art-1": ["tag-a"],
        "art-2": ["tag-b", "tag-c"],
      }),
    ).toBe("art-1|tag-a\nart-2|tag-b,tag-c");
  });

  test("内容変化なしの新 reference は同 signature を返す (regression 防止)", () => {
    const a = { "art-1": ["tag-a", "tag-b"] };
    const b = { "art-1": ["tag-a", "tag-b"] };
    expect(computeArticleTagIdsSignature(a)).toBe(computeArticleTagIdsSignature(b));
  });

  test("tag が 1 つ増えると signature 変化", () => {
    const a = computeArticleTagIdsSignature({ "art-1": ["tag-a"] });
    const b = computeArticleTagIdsSignature({ "art-1": ["tag-a", "tag-b"] });
    expect(a).not.toBe(b);
  });

  test("tag 順序差異で signature 変化 (順序保持の semantics)", () => {
    const a = computeArticleTagIdsSignature({ "art-1": ["tag-a", "tag-b"] });
    const b = computeArticleTagIdsSignature({ "art-1": ["tag-b", "tag-a"] });
    expect(a).not.toBe(b);
  });

  test("空 tagIds array は articleId だけ encode", () => {
    expect(computeArticleTagIdsSignature({ "art-1": [] })).toBe("art-1|");
  });
});
