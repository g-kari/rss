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
