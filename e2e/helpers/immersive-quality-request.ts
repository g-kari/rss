export interface QualityRequest {
  url: string;
  method: string;
  resourceType: string;
  isNavigation: boolean;
  isMainFrame: boolean;
}
export const QUALITY_IMAGES = [
  "https://publisher.test/cover-300x168.webp",
  "https://publisher.test/cover-768x432.webp",
  "https://publisher.test/cover-1600x900.webp",
];
export const QUALITY_CONTENT_URL = `https://quality.test/api/content?url=${encodeURIComponent("https://publisher.test/article")}`;
export function classifyQualityRequest(
  request: QualityRequest,
): "document" | "image" | "content" | null {
  if (request.method !== "GET" || !request.isMainFrame) return null;
  if (request.isNavigation)
    return request.resourceType === "document" &&
      [
        "https://quality.test/",
        "https://quality.test/?case=failure",
        "https://quality.test/?case=cached",
      ].includes(request.url)
      ? "document"
      : null;
  if (
    request.resourceType === "image" &&
    QUALITY_IMAGES.some(
      (image) =>
        request.url === image ||
        request.url === `https://quality.test/api/image-proxy?url=${encodeURIComponent(image)}`,
    )
  )
    return "image";
  if (request.resourceType === "fetch" && request.url === QUALITY_CONTENT_URL) return "content";
  return null;
}
