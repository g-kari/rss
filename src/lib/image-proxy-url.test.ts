import { expect, it } from "vitest";
import { buildImageProxyUrl, buildThumbnailProxyUrl } from "./image-proxy-url";

it("opts thumbnails into empty failures without changing the legacy helper", () => {
  const source = "https://publisher.test/image.svg?error=empty&size=800";
  const legacy = buildImageProxyUrl(source);
  expect(legacy).toBe(`/api/image-proxy?url=${encodeURIComponent(source)}`);
  const strict = buildThumbnailProxyUrl(source);
  const parsed = new URL(strict, "https://reader.test");
  expect(parsed.pathname).toBe("/api/image-proxy");
  expect(parsed.searchParams.get("url")).toBe(source);
  expect(parsed.searchParams.getAll("error")).toEqual(["empty"]);
  expect(buildThumbnailProxyUrl(legacy)).toBe(strict);
  expect(buildThumbnailProxyUrl(strict)).toBe(strict);
});

it("sets one error mode and preserves existing proxy query and fragment semantics", () => {
  const source = "https://publisher.test/image.svg?q=a b&path=%2F";
  const proxied = `/api/image-proxy?width=800&error=svg&url=${encodeURIComponent(source)}&error=other#image`;
  const parsed = new URL(buildThumbnailProxyUrl(proxied), "https://reader.test");
  expect(parsed.searchParams.get("width")).toBe("800");
  expect(parsed.searchParams.get("url")).toBe(source);
  expect(parsed.searchParams.getAll("error")).toEqual(["empty"]);
  expect(parsed.hash).toBe("#image");
});

it.each([undefined, null, 12, {}, ""])("keeps invalid values empty: %j", (source) => {
  expect(buildThumbnailProxyUrl(source)).toBe("");
});

it("leaves private clip image URLs on their existing local route", () => {
  const source = `/api/clip/images/${"a".repeat(64)}`;
  expect(buildThumbnailProxyUrl(source)).toBe(source);
});
