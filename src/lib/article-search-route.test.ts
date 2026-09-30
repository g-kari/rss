// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  search: vi.fn(),
  readSubscriptions: vi.fn(),
  get: vi.fn(),
  readState: vi.fn(),
}));
vi.mock("./server-auth", () => ({
  withSession: (_request: unknown, callback: (context: unknown) => unknown) =>
    callback({
      session: { userId: "user" },
      env: state.env,
      ctx: {},
      origin: "https://example.com",
    }),
}));
vi.mock("./article-search-index", () => ({ searchIndexedArticles: state.search }));
vi.mock("./shared-feed", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readUserSubscriptions: state.readSubscriptions,
}));
vi.mock("./r2", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  r2Get: state.get,
}));
vi.mock("./read-state-merge", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readNormalizedReadState: state.readState,
}));
import { GET } from "../../app/api/articles/route";

beforeEach(() => {
  vi.clearAllMocks();
  state.env = { RSS_DATA: {} };
  state.readSubscriptions.mockResolvedValue([{ feedHash: "feed" }]);
  state.get.mockResolvedValue([]);
  state.readState.mockResolvedValue({
    readIds: [],
    bookmarkIds: [],
    readingListIds: [],
    likeIds: [],
  });
});

describe("GET /api/articles indexed search", () => {
  it("returns [] for an empty or unparseable query before touching D1 or R2", async () => {
    for (const q of ["", "OR -"]) {
      const response = await GET(
        new NextRequest(`https://example.com/api/articles?q=${encodeURIComponent(q)}`),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    }
    expect(state.search).not.toHaveBeenCalled();
    expect(state.get).not.toHaveBeenCalled();
    expect(state.readSubscriptions).not.toHaveBeenCalled();
  });

  it("reports missing, stale or failed indexes as stable 503 errors without SQL details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const error of [
      "ARTICLE_SEARCH D1 binding is not configured",
      "Article search index is not ready",
      "SQLITE_ERROR: private SQL text",
    ]) {
      state.search.mockRejectedValueOnce(new Error(error));
      const response = await GET(new NextRequest("https://example.com/api/articles?q=東京"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Search index is not ready. Please retry later.",
        code: "SEARCH_INDEX_UNAVAILABLE",
      });
    }
    expect(state.search.mock.calls[0][0].db).toBeUndefined();
    log.mockRestore();
  });

  it("preserves article-array response shape, private caching, q precedence and D1 binding", async () => {
    const articles = [{ id: "a", title: "東京" }];
    state.env.ARTICLE_SEARCH = { name: "search-binding" };
    state.search.mockResolvedValueOnce(articles);
    const response = await GET(
      new NextRequest("https://example.com/api/articles?q=東京&feed=invalid&page=999999"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(articles);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect(state.search).toHaveBeenCalledWith(
      expect.objectContaining({ db: state.env.ARTICLE_SEARCH, query: "東京" }),
    );
  });
});
