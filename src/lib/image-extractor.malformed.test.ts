import { expect, it } from "vitest";
import {
  collectImageUrls,
  collectImageUrlsFromHtml,
  isImageHref,
  isTooSmallByUrl,
} from "./image-extractor";
it.each(["%ZZ.jpg", "%E0%A4%A.jpg", "%"])(
  "excludes malformed proxy encoding %s from raw and live-DOM paths without dropping neighbors",
  (encoded) => {
    const bad = `/api/image-proxy?url=${encoded}`;
    expect(isImageHref(bad)).toBe(false);
    expect(isTooSmallByUrl(bad)).toBe(true);
    const html = `<a href="${bad}">bad</a><img src="${bad}"><picture><source srcset="${bad} 2x"></picture><img src="https://example.com/good.jpg" width="800" height="450">`;
    expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/good.jpg"]);
    const element = document.createElement("div");
    element.innerHTML = html;
    expect(collectImageUrls(element)).toEqual(["https://example.com/good.jpg"]);
  },
);
it("preserves valid proxy extension and small-image behavior", () => {
  const proxy = `/api/image-proxy?url=${encodeURIComponent("https://example.com/image-80x80.jpg")}`;
  expect(isImageHref(proxy)).toBe(true);
  expect(isTooSmallByUrl(proxy)).toBe(true);
  expect(
    collectImageUrlsFromHtml(`<img src="${proxy}"><img src="https://example.com/large.jpg">`),
  ).toEqual(["https://example.com/large.jpg"]);
});

it("applies the same guarded decode to absolute DOM proxy URLs and reordered parameters", () => {
  expect(isImageHref("https://rss.0g0.xyz/api/image-proxy?width=80&url=%ZZ.jpg")).toBe(false);
  expect(isTooSmallByUrl("https://rss.0g0.xyz/api/image-proxy?width=80&url=%ZZ.jpg")).toBe(true);
  const source = `https://rss.0g0.xyz/api/image-proxy?width=80&url=${encodeURIComponent("https://example.com/image-80x80.jpg")}`;
  expect(isImageHref(source)).toBe(true);
  expect(isTooSmallByUrl(source)).toBe(true);
});

it.each(["&amp;", "&#38;", "&#x26;"])(
  "keeps valid reordered proxy parameters with HTML separator %s",
  (separator) => {
    const encoded = encodeURIComponent("https://example.com/good-large.jpg");
    const attr = `/api/image-proxy?width=800${separator}url=${encoded}`;
    const html = `<img src="${attr}" width="800" height="450"><img src="/api/image-proxy?url=%ZZ.jpg">`;
    expect(isImageHref(attr)).toBe(true);
    expect(isTooSmallByUrl(attr)).toBe(false);
    expect(collectImageUrlsFromHtml(html)).toEqual([attr]);
    const element = document.createElement("div");
    element.innerHTML = html;
    const result = collectImageUrls(element);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(`url=${encoded}`);
  },
);
