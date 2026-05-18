import { test, expect } from "@playwright/test";
import {
  MIN_IMAGE_SIZE_PX,
  bestSrcFromSrcset,
  collectImageUrlsFromHtml,
} from "../src/lib/image-extractor";

/**
 * image-extractor の単体テスト。
 *
 * - サイズ属性から「両辺とも MIN_IMAGE_SIZE_PX 未満」と判定できる小画像は除外する
 * - データ URI / 非 proxy・非絶対 URL は除外する
 * - collectImageUrls（DOM 版）は Playwright の browser context が必要なため別途 e2e で検証
 */

test.describe("bestSrcFromSrcset", () => {
  test("空文字は空を返す", () => {
    expect(bestSrcFromSrcset("")).toBe("");
  });

  test("最後のエントリの URL（最高解像度）を返す", () => {
    const srcset = "/a.jpg 1x, /a@2x.jpg 2x";
    expect(bestSrcFromSrcset(srcset)).toBe("/a@2x.jpg");
  });
});

test.describe("collectImageUrlsFromHtml — 基本動作", () => {
  test("通常サイズの画像は収集される", () => {
    const html = '<p><img src="https://example.com/a.jpg" width="600" height="400"></p>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/a.jpg"]);
  });

  test("data: URI は除外される", () => {
    const html = '<img src="data:image/gif;base64,AAAA"><img src="https://example.com/b.jpg">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/b.jpg"]);
  });

  test("data: の場合は srcset フォールバックで拾う", () => {
    const html =
      '<img src="data:image/gif;base64,AAAA" srcset="https://example.com/c.jpg 1x, https://example.com/c@2x.jpg 2x">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/c@2x.jpg"]);
  });

  test("重複 URL は一度だけ収集される", () => {
    const html = '<img src="https://example.com/d.jpg"><img src="https://example.com/d.jpg">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/d.jpg"]);
  });

  test("/api/image-proxy の相対 URL は収集される", () => {
    const html = '<img src="/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fe.jpg">';
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fe.jpg",
    ]);
  });
});

test.describe("collectImageUrlsFromHtml — サイズフィルタ", () => {
  test("60x60 の小さい画像は除外される（両辺とも閾値未満）", () => {
    const html = '<img src="https://example.com/icon.png" width="60" height="60">';
    expect(collectImageUrlsFromHtml(html)).toEqual([]);
  });

  test("width/height に px 付きでも正しく判定される", () => {
    const html = '<img src="https://example.com/icon.png" width="60px" height="60px">';
    expect(collectImageUrlsFromHtml(html)).toEqual([]);
  });

  test("閾値ちょうど (MIN_IMAGE_SIZE_PX) は収集される", () => {
    const html = `<img src="https://example.com/ok.png" width="${MIN_IMAGE_SIZE_PX}" height="${MIN_IMAGE_SIZE_PX}">`;
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/ok.png"]);
  });

  test("片方だけ明示で閾値未満の場合は除外しない（縦長・横長画像を誤判定しないため）", () => {
    const html = '<img src="https://example.com/portrait.jpg" width="60">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/portrait.jpg"]);
  });

  test("一辺だけ閾値未満でもう一辺が閾値以上なら収集される", () => {
    const html = '<img src="https://example.com/banner.jpg" width="60" height="400">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/banner.jpg"]);
  });

  test("style の width/height (px) でも判定される", () => {
    const html = '<img src="https://example.com/icon.png" style="width: 48px; height: 48px;">';
    expect(collectImageUrlsFromHtml(html)).toEqual([]);
  });

  test("style が % なら判定対象外（収集される）", () => {
    const html = '<img src="https://example.com/responsive.jpg" style="width: 50%;">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/responsive.jpg"]);
  });

  test("width/height が未指定なら収集される", () => {
    const html = '<img src="https://example.com/unknown.jpg">';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/unknown.jpg"]);
  });

  test("複数画像の混在で小画像のみ除外される", () => {
    const html = `
      <img src="https://example.com/big.jpg" width="800" height="600">
      <img src="https://example.com/icon.png" width="60" height="60">
      <img src="https://example.com/medium.jpg" width="300" height="300">
    `;
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://example.com/big.jpg",
      "https://example.com/medium.jpg",
    ]);
  });
});

/**
 * #667: wallhaven 等の `<a href="full画像"><img src="thumb"></a>` 構造で、
 * `<img src>` (= サムネ) が `MIN_IMAGE_SIZE_PX` 未満で除外され、結果として
 * フル解像度画像も DL されないバグを修正するための anchor href 抽出。
 */
test.describe("collectImageUrlsFromHtml — anchor href からフル解像度画像を抽出", () => {
  test("a href が画像 URL の場合、href も収集対象に含める", () => {
    const html =
      '<a href="https://w.wallhaven.cc/full/5y/wallhaven-5yk1q9.jpg"><img src="https://th.wallhaven.cc/small/5y/wallhaven-5yk1q9.jpg" width="300" height="200"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://w.wallhaven.cc/full/5y/wallhaven-5yk1q9.jpg",
      "https://th.wallhaven.cc/small/5y/wallhaven-5yk1q9.jpg",
    ]);
  });

  test("a href が画像 URL で内部の img が小さくて除外されても、href は残る", () => {
    const html =
      '<a href="https://example.com/full.jpg"><img src="https://example.com/thumb.png" width="60" height="60"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/full.jpg"]);
  });

  test("a href が画像拡張子でない場合は無視 (記事リンクなど)", () => {
    const html =
      '<a href="https://example.com/article/123"><img src="https://example.com/thumb.jpg" width="600" height="400"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/thumb.jpg"]);
  });

  test("対応拡張子: jpg / jpeg / png / gif / webp / avif / svg", () => {
    const html = `
      <a href="https://example.com/a.jpg"></a>
      <a href="https://example.com/b.jpeg"></a>
      <a href="https://example.com/c.png"></a>
      <a href="https://example.com/d.gif"></a>
      <a href="https://example.com/e.webp"></a>
      <a href="https://example.com/f.avif"></a>
    `;
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpeg",
      "https://example.com/c.png",
      "https://example.com/d.gif",
      "https://example.com/e.webp",
      "https://example.com/f.avif",
    ]);
  });

  test("拡張子の大文字小文字を区別しない", () => {
    const html = '<a href="https://example.com/PHOTO.JPG"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/PHOTO.JPG"]);
  });

  test("href にクエリ文字列が付いていても拾う", () => {
    const html = '<a href="https://example.com/full.jpg?v=2"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/full.jpg?v=2"]);
  });

  test("href が img の src と同 URL なら重複排除", () => {
    const html =
      '<a href="https://example.com/x.jpg"><img src="https://example.com/x.jpg" width="600" height="400"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/x.jpg"]);
  });

  test("data: / 相対 URL の href は無視", () => {
    const html = `
      <a href="data:image/png;base64,AAAA"></a>
      <a href="/local/path.jpg"></a>
      <a href="https://example.com/ok.jpg"></a>
    `;
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/ok.jpg"]);
  });

  test("/api/image-proxy 経由の href も拾う", () => {
    const html = '<a href="/api/image-proxy?url=https%3A%2F%2Fexample.com%2Ffull.jpg"></a>';
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "/api/image-proxy?url=https%3A%2F%2Fexample.com%2Ffull.jpg",
    ]);
  });
});

/**
 * #794: Modern Next.js Image / WordPress responsive で本文画像が
 * `<picture><source srcset="...">` のみで配信されるとき、`<img>` 単体走査では
 * 全く拾われず「本文画像が 1 枚 (OGP) のみ DL」現象が起きる。
 */
test.describe("collectImageUrlsFromHtml — <picture><source srcset> から抽出", () => {
  test("<picture><source srcset> の URL を拾う + <img> fallback も拾う", () => {
    const html =
      '<picture><source srcset="https://example.com/large.webp" type="image/webp"><img src="https://example.com/fallback.jpg"></picture>';
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://example.com/large.webp",
      "https://example.com/fallback.jpg",
    ]);
  });

  test("複数 <source> がある場合は各 srcset の最高解像度を拾う", () => {
    const html =
      '<picture><source srcset="https://example.com/a.avif 1x, https://example.com/a@2x.avif 2x" type="image/avif"><source srcset="https://example.com/b.webp"><img src="https://example.com/c.jpg"></picture>';
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://example.com/a@2x.avif",
      "https://example.com/b.webp",
      "https://example.com/c.jpg",
    ]);
  });

  test("<source srcset> と <img src> が同 URL なら重複排除", () => {
    const html =
      '<picture><source srcset="https://example.com/same.jpg"><img src="https://example.com/same.jpg"></picture>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/same.jpg"]);
  });

  test("<source srcset> が data: URI の場合は除外", () => {
    const html =
      '<picture><source srcset="data:image/png;base64,AAAA"><img src="https://example.com/ok.jpg"></picture>';
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/ok.jpg"]);
  });

  test("複数の <picture> 要素を跨いで全て拾う (走査順は source 全件 → img 全件)", () => {
    const html =
      '<picture><source srcset="https://example.com/1.webp"><img src="https://example.com/1.jpg"></picture>' +
      '<picture><source srcset="https://example.com/2.webp"><img src="https://example.com/2.jpg"></picture>';
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://example.com/1.webp",
      "https://example.com/2.webp",
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ]);
  });
});
