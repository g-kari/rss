import { expect, it } from "vitest";
import { bestSrcFromSrcset, collectImageUrlsFromHtml } from "./image-extractor";

it("selects the maximum declared resolution rather than the last responsive entry", () => {
  expect(
    bestSrcFromSrcset("https://example.com/large.webp 1600w, https://example.com/small.webp 300w"),
  ).toBe("https://example.com/large.webp");
  expect(
    bestSrcFromSrcset(
      "https://example.com/3.webp 3x, https://example.com/1.webp 1x, https://example.com/2.webp 2x",
    ),
  ).toBe("https://example.com/3.webp");
  expect(
    bestSrcFromSrcset(
      "https://cdn.example.com/c_limit,w_1600/photo.webp 1600w, https://cdn.example.com/c_limit,w_300/photo.webp 300w",
    ),
  ).toBe("https://cdn.example.com/c_limit,w_1600/photo.webp");
});
it("opts fullscreen collection into srcset without changing ordinary src priority", () => {
  const html =
    '<img src="https://example.com/thumbnail.webp" srcset="https://example.com/large.webp 1600w, https://example.com/small.webp 300w" width="300" height="168">';
  expect(collectImageUrlsFromHtml(html)).toEqual(["https://example.com/thumbnail.webp"]);
  expect(collectImageUrlsFromHtml(html, { preferResponsive: true })).toEqual([
    "https://example.com/large.webp",
  ]);
});
it("ignores small icons but allows a larger responsive source for a small rendering box", () => {
  expect(
    collectImageUrlsFromHtml('<img src="https://example.com/icon.webp" width="60" height="60">', {
      preferResponsive: true,
    }),
  ).toEqual([]);
  expect(
    collectImageUrlsFromHtml(
      '<img src="https://example.com/icon.webp" width="60" height="60" data-srcset="https://example.com/large.webp 1600w">',
      { preferResponsive: true },
    ),
  ).toEqual(["https://example.com/large.webp"]);
});
