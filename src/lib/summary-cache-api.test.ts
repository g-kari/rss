// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import { POST } from "../../app/api/ai/summaries/cache/route";
import { getAiSummaryByUrl } from "./ai-cache";
import { DEFAULT_AI_MODEL } from "./ai-models";

const { bucket, session } = vi.hoisted(() => ({ bucket: {}, session: { authenticated: true } }));
vi.mock("./server-auth", () => ({
  withSession: async (_request: Request, callback: (context: unknown) => Promise<Response>) =>
    session.authenticated
      ? callback({ env: { RSS_DATA: bucket } })
      : Response.json({ error: "unauthorized" }, { status: 401 }),
  parseJsonBody: async (request: Request) => {
    try {
      return { ok: true, data: await request.json() };
    } catch {
      return { ok: false, error: Response.json({ error: "invalid json" }, { status: 400 }) };
    }
  },
}));
vi.mock("./ai-cache", () => ({ getAiSummaryByUrl: vi.fn() }));
const url = "https://example.com/article";
const request = (body: unknown) =>
  new Request("https://rss.example.com/api/ai/summaries/cache", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  session.authenticated = true;
  vi.resetAllMocks();
  vi.mocked(getAiSummaryByUrl).mockResolvedValue(null);
});
describe("summary cache read API", () => {
  it("requires authentication before touching cache", async () => {
    session.authenticated = false;
    expect((await POST(request({ model: DEFAULT_AI_MODEL, urls: [url] }))).status).toBe(401);
    expect(getAiSummaryByUrl).not.toHaveBeenCalled();
  });
  it.each([{}, { urls: [url] }, { model: null, urls: [url] }, { model: "unknown", urls: [url] }])(
    "requires explicit valid model %j",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(getAiSummaryByUrl).not.toHaveBeenCalled();
    },
  );
  it.each([
    [],
    Array(13).fill(url),
    [url, "http://127.0.0.1/"],
    ["file:///secret"],
    [123],
    ["https://example.com/" + "x".repeat(2049)],
  ])("validates the whole bounded URL batch before reads %j", async (urls) => {
    expect((await POST(request({ model: DEFAULT_AI_MODEL, urls }))).status).toBe(400);
    expect(getAiSummaryByUrl).not.toHaveBeenCalled();
  });
  it("returns hits only and deduplicates URLs, with private no-store headers", async () => {
    const metadata = {
      version: 1 as const,
      model: DEFAULT_AI_MODEL,
      promptVersion: null,
      bodyHash: null,
      generatedAt: null,
      inputCharacters: null,
      inputTruncated: null,
      completeness: "unknown" as const,
      usage: null,
    };
    vi.mocked(getAiSummaryByUrl).mockResolvedValueOnce({ result: "cached", metadata });
    const response = await POST(
      request({ model: DEFAULT_AI_MODEL, urls: [url, url, url + "/miss"] }),
    );
    expect(await response.json()).toEqual({
      model: DEFAULT_AI_MODEL,
      summaries: [{ url, result: "cached", metadata }],
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getAiSummaryByUrl).toHaveBeenCalledTimes(2);
  });
  it("a miss is read-only and never invokes body retrieval or AI", async () => {
    const response = await POST(request({ model: DEFAULT_AI_MODEL, urls: [url] }));
    expect(await response.json()).toEqual({ model: DEFAULT_AI_MODEL, summaries: [] });
    expect(getAiSummaryByUrl).toHaveBeenCalledWith(bucket, url, DEFAULT_AI_MODEL);
  });
});
