import { expect, it } from "vitest";
import { articleListScopeTitle } from "./article-list-scope";

it("keeps feed/group/tag and collection intersections in the complete scope name", () => {
  expect(
    articleListScopeTitle({ feedId: "a", feedTitle: "Feed A", collectionTitle: "資料C" }),
  ).toBe("Feed A · コレクション: 資料C");
  expect(articleListScopeTitle({ groupTitle: "開発", collectionTitle: "資料C" })).toBe(
    "開発 · コレクション: 資料C",
  );
  expect(articleListScopeTitle({ tag: "設計", collectionTitle: "資料C" })).toBe(
    "タグ: 設計 · コレクション: 資料C",
  );
  expect(articleListScopeTitle({ feedId: "__bookmarks__", collectionTitle: "資料C" })).toBe(
    "ブックマーク · コレクション: 資料C",
  );
});
it("matches feed predicate precedence and leaves an unscoped list clear", () => {
  expect(
    articleListScopeTitle({ feedId: "a", feedTitle: "Feed A", groupTitle: "開発", tag: "設計" }),
  ).toBe("Feed A · タグ: 設計");
  expect(articleListScopeTitle({})).toBe("すべての記事");
  expect(articleListScopeTitle({ collectionTitle: "資料C" })).toBe("コレクション: 資料C");
});
