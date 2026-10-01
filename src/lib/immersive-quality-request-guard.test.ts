import { expect, it } from "vitest";
import {
  classifyQualityRequest,
  QUALITY_CONTENT_URL,
  QUALITY_IMAGES,
  type QualityRequest,
} from "../../e2e/helpers/immersive-quality-request";
const image: QualityRequest = {
  url: QUALITY_IMAGES[0],
  method: "GET",
  resourceType: "image",
  isMainFrame: true,
  isNavigation: false,
};
const content = { ...image, url: QUALITY_CONTENT_URL, resourceType: "fetch" };
const document = {
  ...image,
  url: "https://quality.test/",
  resourceType: "document",
  isNavigation: true,
};
it("accepts only exact synthetic document/image/content reads", () => {
  expect(classifyQualityRequest(document)).toBe("document");
  expect(classifyQualityRequest(image)).toBe("image");
  expect(
    classifyQualityRequest({
      ...image,
      url: `https://quality.test/api/image-proxy?url=${encodeURIComponent(QUALITY_IMAGES[0])}`,
    }),
  ).toBe("image");
  expect(classifyQualityRequest(content)).toBe("content");
});
it.each([
  { ...document, method: "POST" },
  { ...image, method: "HEAD" },
  { ...content, method: "POST" },
  { ...document, isMainFrame: false },
  { ...image, isMainFrame: false },
  { ...content, isMainFrame: false },
  { ...document, isNavigation: false },
  { ...image, isNavigation: true },
  { ...content, isNavigation: true },
  { ...document, resourceType: "fetch" },
  { ...image, resourceType: "script" },
  { ...content, resourceType: "image" },
  { ...document, url: "https://quality.test/?other=1" },
  { ...document, url: "https://quality.test/?case=failure&other=1" },
  { ...image, url: "https://outside.test/cover.webp" },
  { ...image, url: `${QUALITY_IMAGES[0]}?other=1` },
  {
    ...image,
    url: `https://quality.test/api/image-proxy?url=${encodeURIComponent(QUALITY_IMAGES[0])}&other=1`,
  },
  { ...content, url: `${QUALITY_CONTENT_URL}&other=1` },
  { ...content, url: QUALITY_CONTENT_URL.replace("https:", "http:") },
  { ...content, url: QUALITY_CONTENT_URL.replace("quality.test", "quality.test.outside.test") },
  { ...content, url: QUALITY_CONTENT_URL.replace("quality.test", "user@quality.test") },
  { ...content, url: QUALITY_CONTENT_URL.replace("quality.test", "quality.test:8443") },
  { ...content, url: "https://quality.test/api/articles/state" },
])("rejects nonfixture requests %j", (request) => {
  expect(classifyQualityRequest(request)).toBeNull();
});
