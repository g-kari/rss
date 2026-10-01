import type { Route } from "@playwright/test";

export const READER_MOTION_DOCUMENT_URL = "https://rss-motion.test/";
export const READER_MOTION_IMAGE_URL = `${READER_MOTION_DOCUMENT_URL}image.svg`;
export const READER_MOTION_PROXY_URL = `${READER_MOTION_DOCUMENT_URL}api/image-proxy?url=${encodeURIComponent(READER_MOTION_IMAGE_URL)}`;

export interface ReaderMotionFixtureRequest {
  url: string;
  method: string;
  resourceType: string;
  isNavigation: boolean;
  isMainFrame: boolean;
}

/** Exact synthetic resources only. Unknown requests must fail the browser test. */
export async function serveReaderMotionFixture(
  request: ReaderMotionFixtureRequest,
  route: Pick<Route, "fulfill" | "abort">,
  html: string,
  errors: string[],
): Promise<void> {
  if (request.method === "GET" && request.isMainFrame) {
    if (
      request.url === READER_MOTION_DOCUMENT_URL &&
      request.isNavigation &&
      request.resourceType === "document"
    ) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      return;
    }
    if (
      !request.isNavigation &&
      request.resourceType === "image" &&
      (request.url === READER_MOTION_IMAGE_URL || request.url === READER_MOTION_PROXY_URL)
    ) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#4738a0"/><circle cx="520" cy="170" r="180" fill="#83debd"/></svg>',
      });
      return;
    }
  }
  errors.push(
    `unexpected ${request.method} ${request.resourceType} ${request.isNavigation ? "navigation" : "subresource"} ${request.url}`,
  );
  await route.abort();
}
