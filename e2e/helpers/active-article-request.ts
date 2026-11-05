import type { Page, Request as PlaywrightRequest } from "@playwright/test";

export interface ActiveArticleDispatch {
  articleId: string | null;
  visible: boolean;
  aborted: boolean;
}
export interface ActiveArticleRequest {
  url: string;
  method: string;
  resourceType: string;
  isNavigation: boolean;
  isMainFrame: boolean;
}
const dispatchHeader = "x-rss-fixture-dispatch";

/** Exact, source-bound synthetic reads. Known but inactive URLs are still forbidden. */
export function classifyActiveArticleRequest(
  request: ActiveArticleRequest,
  dispatch: ActiveArticleDispatch | null,
  origin: string,
  articles: Readonly<Record<string, string>>,
): "content" | "ogp" | null {
  if (
    request.method !== "GET" ||
    !request.isMainFrame ||
    request.isNavigation ||
    request.resourceType !== "fetch" ||
    !dispatch?.visible ||
    dispatch.articleId === null ||
    !Object.hasOwn(articles, dispatch.articleId)
  )
    return null;
  const target = encodeURIComponent(articles[dispatch.articleId]);
  if (request.url === `${origin}/api/content?url=${target}`) return "content";
  if (request.url === `${origin}/api/ogp?url=${target}`) return "ogp";
  return null;
}

/**
 * Capture the committed active card synchronously at fetch dispatch, not later
 * during an asynchronous route callback. A unique header correlates each request
 * one-to-one; aborted/no-route captures cannot authorize later same-URL requests.
 * This hook runs only in isolated synthetic fixtures, never in the application.
 */
export async function installActiveArticleCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const captures: Record<string, ActiveArticleDispatch> = {};
    const fixture = window as typeof window & {
      immersiveRequestDispatches?: Record<string, ActiveArticleDispatch>;
    };
    fixture.immersiveRequestDispatches = captures;
    const epoch = crypto.randomUUID();
    let sequence = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (
        url.origin !== location.origin ||
        !["/api/content", "/api/ogp"].includes(url.pathname) ||
        request.signal.aborted
      )
        return originalFetch(request);
      const slide = document.querySelector(
        '.immersive-dialog .immersive-slide[aria-hidden="false"]',
      );
      const id = `${epoch}:${++sequence}`;
      const snapshot: ActiveArticleDispatch = {
        articleId: slide?.getAttribute("data-article-id") ?? null,
        visible: document.visibilityState !== "hidden" && !!slide?.isConnected,
        aborted: false,
      };
      captures[id] = snapshot;
      request.signal.addEventListener(
        "abort",
        () => {
          snapshot.aborted = true;
        },
        { once: true },
      );
      const headers = new Headers(request.headers);
      headers.set("x-rss-fixture-dispatch", id);
      return originalFetch(new Request(request, { headers }));
    };
  });
}

export async function matchActiveArticleRequest(
  page: Page,
  request: PlaywrightRequest,
  origin: string,
  articles: Readonly<Record<string, string>>,
): Promise<{ kind: "content" | "ogp"; articleUrl: string; aborted: boolean } | null> {
  // Do not evaluate another frame or consume any capture for an unrelated route.
  if (
    request.frame() !== page.mainFrame() ||
    request.method() !== "GET" ||
    request.isNavigationRequest() ||
    request.resourceType() !== "fetch" ||
    !request.url().startsWith(`${origin}/api/`)
  )
    return null;
  const id = request.headers()[dispatchHeader];
  if (!id || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}:[1-9]\d*$/.test(id)) return null;
  const dispatch = await page.evaluate((key) => {
    const captures = (
      window as typeof window & {
        immersiveRequestDispatches?: Record<string, ActiveArticleDispatch>;
      }
    ).immersiveRequestDispatches;
    const snapshot = captures?.[key] ?? null;
    if (captures) delete captures[key];
    return snapshot;
  }, id);
  const kind = classifyActiveArticleRequest(
    {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      isNavigation: request.isNavigationRequest(),
      isMainFrame: true,
    },
    dispatch,
    origin,
    articles,
  );
  return kind && dispatch?.articleId !== null && dispatch?.articleId !== undefined
    ? { kind, articleUrl: articles[dispatch.articleId], aborted: dispatch.aborted }
    : null;
}

export const previewArticles = Object.fromEntries(
  Array.from({ length: 23 }, (_, index) => [String(index), `https://example.com/${index}`]),
);
