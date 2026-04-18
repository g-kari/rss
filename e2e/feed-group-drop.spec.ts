import { test, expect } from "@playwright/test";
import { resolveFeedGroupDrop } from "../src/lib/feed-group-drop";
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
