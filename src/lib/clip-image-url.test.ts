import { describe, expect, it } from "vitest";
import { isClipImageUrl } from "./clip-image-url";
import { buildImageProxyUrl } from "./image-proxy-url";
import { collectImageUrlsFromHtml } from "./image-extractor";
const path = `/api/clip/images/${"a".repeat(64)}`;
describe("private clip image paths", () => {
  it("keeps only valid private paths out of the external proxy", () => {
    expect(isClipImageUrl(path)).toBe(true);
    expect(buildImageProxyUrl(path)).toBe(path);
    for (const invalid of [
      "/api/clip/images/../token",
      path + "?x=1",
      "https://evil.example" + path,
      "//evil.example" + path,
    ]) {
      expect(isClipImageUrl(invalid)).toBe(false);
      expect(buildImageProxyUrl(invalid)).not.toBe(invalid);
    }
  });
  it("includes private images in thumbnails/gallery collection", () => {
    expect(collectImageUrlsFromHtml(`<img src="${path}" width="640" height="480">`)).toContain(
      path,
    );
  });
});
