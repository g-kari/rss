import { test, expect } from "@playwright/test";
import { resolveFeedGroupDrop, resolveFeedViewDrop } from "../src/lib/feed-group-drop";
import type { Feed } from "../src/types";

function makeFeed(overrides: Partial<Feed>): Feed {
  return {
    id: "feed-1",
    url: "https://example.com/feed.xml",
    title: "Example",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    ...overrides,
  };
}

test("resolveFeedGroupDrop: 対象 feed が存在しないとき null を返す", () => {
  const feeds = [makeFeed({ id: "feed-1" })];
  expect(resolveFeedGroupDrop("missing", "group-a", feeds)).toBeNull();
});

test("resolveFeedGroupDrop: 同一グループへのドロップは null を返す", () => {
  const feeds = [makeFeed({ id: "feed-1", groupId: "group-a" })];
  expect(resolveFeedGroupDrop("feed-1", "group-a", feeds)).toBeNull();
});

test("resolveFeedGroupDrop: グループに所属しない feed を ungrouped にドロップすると null を返す", () => {
  const feeds = [makeFeed({ id: "feed-1" })];
  expect(resolveFeedGroupDrop("feed-1", null, feeds)).toBeNull();
});

test("resolveFeedGroupDrop: 異なるグループへドロップすると解決結果を返す", () => {
  const feed = makeFeed({ id: "feed-1", groupId: "group-a" });
  const result = resolveFeedGroupDrop("feed-1", "group-b", [feed]);
  expect(result).toEqual({ feed, targetGroupId: "group-b" });
});

test("resolveFeedGroupDrop: グループ所属 feed を ungrouped にドロップすると null 目標で解決", () => {
  const feed = makeFeed({ id: "feed-1", groupId: "group-a" });
  const result = resolveFeedGroupDrop("feed-1", null, [feed]);
  expect(result).toEqual({ feed, targetGroupId: null });
});

test("resolveFeedGroupDrop: 未分類 feed を新規グループへドロップすると解決", () => {
  const feed = makeFeed({ id: "feed-1" });
  const result = resolveFeedGroupDrop("feed-1", "group-a", [feed]);
  expect(result).toEqual({ feed, targetGroupId: "group-a" });
});

// --- resolveFeedViewDrop ---

test("resolveFeedViewDrop: 対象 feed が存在しな��とき null を返す", () => {
  const feeds = [makeFeed({ id: "feed-1" })];
  expect(resolveFeedViewDrop("missing", "pictures", feeds)).toBeNull();
});

test("resolveFeedViewDrop: 同一ビューへのドロップは null を返す", () => {
  const feeds = [makeFeed({ id: "feed-1", view: "pictures" })];
  expect(resolveFeedViewDrop("feed-1", "pictures", feeds)).toBeNull();
});

test("resolveFeedViewDrop: view 未設定の feed を articles にドロップすると null を返す", () => {
  const feeds = [makeFeed({ id: "feed-1" })];
  expect(resolveFeedViewDrop("feed-1", "articles", feeds)).toBeNull();
});

test("resolveFeedViewDrop: articles feed を pictures にドロップすると解決", () => {
  const feed = makeFeed({ id: "feed-1" });
  const result = resolveFeedViewDrop("feed-1", "pictures", [feed]);
  expect(result).toEqual({ feed, targetView: "pictures" });
});

test("resolveFeedViewDrop: pictures feed を articles にドロップすると null に解決", () => {
  const feed = makeFeed({ id: "feed-1", view: "pictures" });
  const result = resolveFeedViewDrop("feed-1", "articles", [feed]);
  expect(result).toEqual({ feed, targetView: null });
});

test("resolveFeedViewDrop: videos feed を social にドロップすると解決", () => {
  const feed = makeFeed({ id: "feed-1", view: "videos" });
  const result = resolveFeedViewDrop("feed-1", "social", [feed]);
  expect(result).toEqual({ feed, targetView: "social" });
});
