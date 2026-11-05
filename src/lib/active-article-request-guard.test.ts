import { expect, it } from "vitest";
import {
  classifyActiveArticleRequest,
  type ActiveArticleRequest,
  type ActiveArticleDispatch,
} from "../../e2e/helpers/active-article-request";

const origin = "https://rss-fixture.test";
const articles = { active: "https://example.com/active", queued: "https://example.com/queued" };
const dispatch: ActiveArticleDispatch = { articleId: "active", visible: true, aborted: false };
const request: ActiveArticleRequest = {
  url: `${origin}/api/content?url=${encodeURIComponent(articles.active)}`,
  method: "GET",
  resourceType: "fetch",
  isMainFrame: true,
  isNavigation: false,
};
it("accepts only the exact article committed active at dispatch", () => {
  expect(classifyActiveArticleRequest(request, dispatch, origin, articles)).toBe("content");
  expect(
    classifyActiveArticleRequest(
      { ...request, url: request.url.replace("/content?", "/ogp?") },
      dispatch,
      origin,
      articles,
    ),
  ).toBe("ogp");
});
it.each([
  { ...request, method: "POST" },
  { ...request, method: "HEAD" },
  { ...request, isMainFrame: false },
  { ...request, isNavigation: true },
  { ...request, resourceType: "xhr" },
  { ...request, resourceType: "image" },
  { ...request, url: request.url.replace("rss-fixture.test", "rss-fixture.test.evil.test") },
  { ...request, url: request.url.replace("https:", "http:") },
  { ...request, url: request.url.replace("rss-fixture.test", "user@rss-fixture.test") },
  { ...request, url: request.url.replace("rss-fixture.test", "rss-fixture.test:8443") },
  { ...request, url: `${request.url}&other=1` },
  { ...request, url: `${request.url}&url=${encodeURIComponent(articles.active)}` },
  { ...request, url: `${request.url}#fragment` },
  { ...request, url: `${origin}/api/content?url=${encodeURIComponent(articles.queued)}` },
  {
    ...request,
    url: `${origin}/api/content?url=${encodeURIComponent("http://127.0.0.1/private")}`,
  },
  { ...request, url: `${origin}/api/ai/summarize` },
  { ...request, url: `${origin}/api/ai/translate` },
  { ...request, url: `${origin}/api/auth/logout` },
])(
  "rejects every nonmatching origin/URL/query/method/frame/resource/navigation shape %j",
  (candidate) => {
    expect(classifyActiveArticleRequest(candidate, dispatch, origin, articles)).toBeNull();
  },
);
it.each([
  null,
  { ...dispatch, visible: false },
  { ...dispatch, articleId: null },
  { ...dispatch, articleId: "unknown" },
  { ...dispatch, articleId: "queued" },
])(
  "rejects missing, closed, hidden, unknown and inactive dispatch snapshots %j",
  (candidate) =>
    expect(classifyActiveArticleRequest(request, candidate, origin, articles)).toBeNull(),
);
