import { describe, expect, it, vi } from "vitest";
import {
  READER_MOTION_DOCUMENT_URL,
  READER_MOTION_IMAGE_URL,
  READER_MOTION_PROXY_URL,
  serveReaderMotionFixture,
  type ReaderMotionFixtureRequest,
} from "../../e2e/helpers/reader-motion-request";

const image: ReaderMotionFixtureRequest = {
  url: READER_MOTION_IMAGE_URL,
  method: "GET",
  resourceType: "image",
  isNavigation: false,
  isMainFrame: true,
};
const document: ReaderMotionFixtureRequest = {
  ...image,
  url: READER_MOTION_DOCUMENT_URL,
  resourceType: "document",
  isNavigation: true,
};
function route() {
  return { fulfill: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
}

describe("reader-motion browser fixture request guard", () => {
  it.each([
    ["main document", document, "text/html; charset=utf-8"],
    ["direct local image", image, "image/svg+xml"],
    ["exact local proxy image", { ...image, url: READER_MOTION_PROXY_URL }, "image/svg+xml"],
  ] as const)("fulfills only the expected %s", async (_name, request, contentType) => {
    const target = route();
    const errors: string[] = [];
    await serveReaderMotionFixture(request, target, "<html>fixture</html>", errors);
    expect(target.fulfill).toHaveBeenCalledExactlyOnceWith({
      contentType,
      body: contentType.startsWith("text/html") ? "<html>fixture</html>" : expect.any(String),
    });
    expect(target.abort).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it.each([
    ["POST document", { ...document, method: "POST" }],
    ["HEAD document", { ...document, method: "HEAD" }],
    ["POST direct image", { ...image, method: "POST" }],
    ["POST proxy image", { ...image, url: READER_MOTION_PROXY_URL, method: "POST" }],
    ["non-navigation document", { ...document, isNavigation: false }],
    ["subframe document", { ...document, isMainFrame: false }],
    ["wrong document resource", { ...document, resourceType: "fetch" }],
    ["document query", { ...document, url: `${READER_MOTION_DOCUMENT_URL}?image.svg` }],
    ["image navigation", { ...document, url: READER_MOTION_IMAGE_URL }],
    ["proxy navigation", { ...document, url: READER_MOTION_PROXY_URL }],
    ["image fetch", { ...image, resourceType: "fetch" }],
    ["image script", { ...image, resourceType: "script" }],
    ["proxy fetch", { ...image, url: READER_MOTION_PROXY_URL, resourceType: "fetch" }],
    ["subframe image", { ...image, isMainFrame: false }],
    ["external image", { ...image, url: "https://outside.test/image.svg" }],
    ["lookalike origin", { ...image, url: "https://rss-motion.test.outside.test/image.svg" }],
    ["HTTP origin", { ...image, url: "http://rss-motion.test/image.svg" }],
    ["different port", { ...image, url: "https://rss-motion.test:8443/image.svg" }],
    ["credentials", { ...image, url: "https://user@rss-motion.test/image.svg" }],
    ["image suffix", { ...image, url: `${READER_MOTION_IMAGE_URL}.js` }],
    ["image query", { ...image, url: `${READER_MOTION_IMAGE_URL}?unexpected=1` }],
    ["image fragment", { ...image, url: `${READER_MOTION_IMAGE_URL}#unexpected` }],
    [
      "unrelated path containing image",
      { ...image, url: "https://rss-motion.test/unexpected/image.svg" },
    ],
    [
      "external proxy",
      { ...image, url: READER_MOTION_PROXY_URL.replace("rss-motion.test/", "outside.test/") },
    ],
    ["proxy suffix", { ...image, url: "https://rss-motion.test/api/image-proxy-unexpected" }],
    ["missing proxy target", { ...image, url: "https://rss-motion.test/api/image-proxy" }],
    [
      "wrong proxy target",
      {
        ...image,
        url: `https://rss-motion.test/api/image-proxy?url=${encodeURIComponent("https://outside.test/image.svg")}`,
      },
    ],
    ["extra proxy parameter", { ...image, url: `${READER_MOTION_PROXY_URL}&unexpected=1` }],
    [
      "duplicate proxy parameter",
      {
        ...image,
        url: `${READER_MOTION_PROXY_URL}&url=${encodeURIComponent(READER_MOTION_IMAGE_URL)}`,
      },
    ],
    [
      "unrelated URL with image in query",
      {
        ...image,
        url: `https://rss-motion.test/api/unexpected?url=${encodeURIComponent(READER_MOTION_IMAGE_URL)}`,
      },
    ],
  ] as const)("aborts and records %s", async (_name, request) => {
    const target = route();
    const errors: string[] = [];
    await serveReaderMotionFixture(request, target, "<html>fixture</html>", errors);
    expect(target.fulfill).not.toHaveBeenCalled();
    expect(target.abort).toHaveBeenCalledExactlyOnceWith();
    expect(errors).toEqual([
      `unexpected ${request.method} ${request.resourceType} ${request.isNavigation ? "navigation" : "subresource"} ${request.url}`,
    ]);
  });
});
