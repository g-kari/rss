import { test, expect } from "@playwright/test";
import { buildArticlesKey, collectGalleryMediaFromHtml } from "../src/lib/gallery-prefetch";
import { collectImageUrlsFromHtml } from "../src/lib/image-extractor";
import { collectIframeUrlsFromHtml } from "../src/lib/embed-utils";
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

// #866 案 A: collectGalleryMediaFromHtml は collectImageUrlsFromHtml +
// collectIframeUrlsFromHtml を 1 関数呼び出しに集約した combined helper。
// 戻り値の images / embeds が既存 2 helper の個別呼出と完全互換 (順序含む)
// であることを保証する regression spec。
test.describe("collectGalleryMediaFromHtml (#866 案 A)", () => {
  test("空文字 → 空配列ペア", () => {
    expect(collectGalleryMediaFromHtml("")).toEqual({ images: [], embeds: [] });
  });

  test("非 string 入力 (null / undefined / number / object) → 空配列ペア (#812 defensive)", () => {
    expect(collectGalleryMediaFromHtml(null)).toEqual({ images: [], embeds: [] });
    expect(collectGalleryMediaFromHtml(undefined)).toEqual({ images: [], embeds: [] });
    expect(collectGalleryMediaFromHtml(42)).toEqual({ images: [], embeds: [] });
    expect(collectGalleryMediaFromHtml({ content: "<img src='x.jpg'>" })).toEqual({
      images: [],
      embeds: [],
    });
    expect(collectGalleryMediaFromHtml(["<img src='x.jpg'>"])).toEqual({
      images: [],
      embeds: [],
    });
    expect(collectGalleryMediaFromHtml(true)).toEqual({ images: [], embeds: [] });
  });

  test("image のみ含む HTML → images に抽出、embeds は空", () => {
    const html = '<div><img src="https://example.com/photo.jpg" width="800" height="600"></div>';
    const result = collectGalleryMediaFromHtml(html);
    expect(result.images).toEqual(["https://example.com/photo.jpg"]);
    expect(result.embeds).toEqual([]);
  });

  test("YouTube iframe のみ含む HTML → embeds に抽出、images は空", () => {
    const html = '<div><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div>';
    const result = collectGalleryMediaFromHtml(html);
    expect(result.images).toEqual([]);
    expect(result.embeds).toEqual(["https://www.youtube.com/embed/dQw4w9WgXcQ"]);
  });

  test("image + iframe 両方含む HTML → 両方抽出", () => {
    const html = `
      <article>
        <img src="https://example.com/a.jpg" width="800" height="600">
        <iframe src="https://www.youtube.com/embed/abc123XYZ_0"></iframe>
        <img src="https://example.com/b.jpg" width="800" height="600">
      </article>
    `;
    const result = collectGalleryMediaFromHtml(html);
    expect(result.images).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);
    expect(result.embeds).toEqual(["https://www.youtube.com/embed/abc123XYZ_0"]);
  });

  // 既存挙動互換性の最重要 regression: combined helper の出力が
  // 既存 2 helper を個別に呼んだ結果と完全一致 (順序含む)
  test("既存挙動互換性: images / embeds が個別呼出と完全一致", () => {
    const html = `
      <article>
        <a href="https://example.com/full.jpg">link</a>
        <picture>
          <source srcset="https://example.com/responsive.jpg 1x, https://example.com/responsive@2x.jpg 2x">
        </picture>
        <img src="https://example.com/inline.jpg" width="800" height="600">
        <iframe src="https://www.youtube.com/embed/abc123XYZ_0"></iframe>
        <iframe src="https://player.vimeo.com/video/123456789"></iframe>
      </article>
    `;
    const combined = collectGalleryMediaFromHtml(html);
    expect(combined.images).toEqual(collectImageUrlsFromHtml(html));
    expect(combined.embeds).toEqual(collectIframeUrlsFromHtml(html));
  });

  test("既存挙動互換性: image / iframe どちらもない HTML でも個別呼出と一致", () => {
    const html = "<p>テキストのみ</p><blockquote>引用</blockquote>";
    const combined = collectGalleryMediaFromHtml(html);
    expect(combined.images).toEqual(collectImageUrlsFromHtml(html));
    expect(combined.embeds).toEqual(collectIframeUrlsFromHtml(html));
    expect(combined.images).toEqual([]);
    expect(combined.embeds).toEqual([]);
  });
});
