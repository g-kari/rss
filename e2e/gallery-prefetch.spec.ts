import { test, expect } from "@playwright/test";
import { buildArticlesKey } from "../src/lib/gallery-prefetch";
import { makeArticle as makeBaseArticle } from "./helpers/article";

const makeArticle = (id: string, link?: string) =>
  makeBaseArticle({
    id,
    feedHash: "abc123def456",
    guid: id,
    title: id,
    link: link ?? `https://example.com/${id}`,
    publishedAt: "2026-05-09T00:00:00Z",
    createdAt: "2026-05-09T00:00:00Z",
  });

// link なし / 空文字を擬似的に作る (実装の filter テスト用)
const makeArticleNoLink = (id: string, link: string) =>
  makeBaseArticle({
    id,
    feedHash: "abc123def456",
    guid: id,
    title: id,
    link,
    publishedAt: "2026-05-09T00:00:00Z",
    createdAt: "2026-05-09T00:00:00Z",
  });

test.describe("buildArticlesKey (#669)", () => {
  test("空配列 → 空文字", () => {
    expect(buildArticlesKey([])).toBe("");
  });

  test("単一記事 → ID 1 個", () => {
    expect(buildArticlesKey([makeArticle("a1")])).toBe("a1");
  });

  test("複数記事 → \\0 区切りで連結", () => {
    expect(buildArticlesKey([makeArticle("a1"), makeArticle("a2"), makeArticle("a3")])).toBe(
      "a1\0a2\0a3",
    );
  });

  test("link なし扱いの記事は除外する", () => {
    // 型を欺いて link を null 相当にする (実コードでは fast-xml-parser 経由で
    // link 不在記事が混入することがあり、Boolean(a.link) でフィルタが必要)
    const articles = [
      makeArticle("a1"),
      makeArticleNoLink("a2", null as unknown as string),
      makeArticle("a3"),
    ];
    expect(buildArticlesKey(articles)).toBe("a1\0a3");
  });

  test("link が空文字 (falsy) の記事も除外する", () => {
    const articles = [makeArticle("a1"), makeArticleNoLink("a2", ""), makeArticle("a3")];
    expect(buildArticlesKey(articles)).toBe("a1\0a3");
  });

  // #669 の核心: visible 拡張時にキーが変化すること
  test("visible 拡張で必ずキーが変化する (#669 真因の回帰防止)", () => {
    const initial = Array.from({ length: 50 }, (_, i) => makeArticle(`a${i}`));
    const expanded = [...initial, ...Array.from({ length: 50 }, (_, i) => makeArticle(`b${i}`))];
    const initialKey = buildArticlesKey(initial);
    const expandedKey = buildArticlesKey(expanded);
    expect(initialKey).not.toBe(expandedKey);
    expect(expandedKey.length).toBeGreaterThan(initialKey.length);
  });

  test("先頭 N 件が同じでも N+1 件目以降が違えばキーが変わる", () => {
    const a = Array.from({ length: 30 }, (_, i) => makeArticle(`x${i}`));
    const b = [...a.slice(0, 20), ...Array.from({ length: 10 }, (_, i) => makeArticle(`y${i}`))];
    expect(buildArticlesKey(a)).not.toBe(buildArticlesKey(b));
  });

  test("同じ articles の参照が変わってもキーが安定する (毎レンダー再実行回避)", () => {
    const a1 = [makeArticle("p1"), makeArticle("p2")];
    const a2 = [makeArticle("p1"), makeArticle("p2")]; // 別参照だが内容同じ
    expect(buildArticlesKey(a1)).toBe(buildArticlesKey(a2));
  });
});
