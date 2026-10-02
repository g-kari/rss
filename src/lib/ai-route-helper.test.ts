// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { runAiJob } from "./ai-route-helper";
import { DEFAULT_AI_MODEL } from "./ai-models";
import { getAiCacheByUrl, setAiCacheByUrl, setAiSummaryByUrl } from "./ai-cache";
import { fetchArticleContent } from "./fetch-article-content";
import { claimSummaryGeneration, summaryGenerationRetryAfter } from "./ai-generation-lease";
import { checkSlidingWindow } from "./rate-limit";

vi.mock("./server-auth", () => ({
  parseJsonBody: async (request: Request) => ({ ok: true, data: await request.json() }),
}));
vi.mock("./ai-cache", () => ({
  getAiCacheByUrl: vi.fn(),
  setAiCacheByUrl: vi.fn(),
  setAiSummaryByUrl: vi.fn(),
}));
vi.mock("./fetch-article-content", () => ({ fetchArticleContent: vi.fn() }));
vi.mock("./rate-limit", () => ({ checkSlidingWindow: vi.fn() }));
vi.mock("./html", () => ({ toPlainText: (text: string) => text }));

vi.mock("./ai-generation-lease", () => ({
  claimSummaryGeneration: vi.fn(async () => ({ key: "lease", owner: "owner", etag: "etag" })),
  finishSummaryGeneration: vi.fn(async () => {}),
  failSummaryGeneration: vi.fn(async () => {}),
  summaryGenerationRetryAfter: vi.fn(async () => 300),
}));

const articleBody = "article body ".repeat(20).trim();
const url = "https://example.com/article";
const run = vi.fn();
const waitUntil = vi.fn();
const env = {
  AI: { run } as unknown as Ai,
  RSS_DATA: {} as R2Bucket,
  RATE_LIMIT: {} as KVNamespace,
};
const ctx = { waitUntil } as unknown as ExecutionContext;

function request(model?: unknown) {
  return new Request("https://rss.example.com/api/ai/summarize", {
    method: "POST",
    body: JSON.stringify({ url, ...(model !== undefined ? { model } : {}) }),
  });
}

function execute(model?: unknown, cacheType: "summary" | "translation" = "summary") {
  return runAiJob(
    request(model),
    { userId: "reader" },
    env,
    ctx,
    (content) => [{ role: "user", content }],
    cacheType,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAiCacheByUrl).mockResolvedValue(null);
  vi.mocked(setAiCacheByUrl).mockResolvedValue(undefined);
  vi.mocked(setAiSummaryByUrl).mockResolvedValue(undefined);
  vi.mocked(fetchArticleContent).mockResolvedValue(articleBody);
  vi.mocked(checkSlidingWindow).mockResolvedValue(null);
  run.mockResolvedValue({ response: "legacy result" });
});

describe("runAiJob model handling", () => {
  it("returns explicit manual retry eligibility/cooldown without duplicate AI", async () => {
    vi.mocked(claimSummaryGeneration).mockResolvedValueOnce(null);
    vi.mocked(summaryGenerationRetryAfter).mockResolvedValueOnce(300);
    const response = await execute();
    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(await response.json()).toMatchObject({
      code: "SUMMARY_GENERATION_PENDING",
      retryable: true,
      retryAfter: 300,
    });
    expect(run).not.toHaveBeenCalled();
  });
  it("exposes operator recovery for an active/storage-ambiguous claim", async () => {
    vi.mocked(claimSummaryGeneration).mockResolvedValueOnce(null);
    vi.mocked(summaryGenerationRetryAfter).mockResolvedValueOnce(null);
    const response = await execute();
    expect(await response.json()).toMatchObject({
      code: "SUMMARY_GENERATION_PENDING",
      retryable: false,
      recoveryRequired: true,
    });
    expect(run).not.toHaveBeenCalled();
  });
  it.each([null, "", "short", "[INST]".repeat(60)])(
    "rejects missing/short/effectively empty summary body without AI %j",
    async (content) => {
      vi.mocked(fetchArticleContent).mockResolvedValueOnce(content);
      const response = await execute();
      expect(response.status).toBe(content === null || content === "" ? 502 : 422);
      expect(run).not.toHaveBeenCalled();
      expect(setAiSummaryByUrl).not.toHaveBeenCalled();
    },
  );

  it("uses the default only when model is omitted", async () => {
    const response = await execute();
    expect(await response.json()).toEqual({ result: "legacy result" });
    expect(run).toHaveBeenCalledWith(DEFAULT_AI_MODEL, {
      messages: [{ role: "user", content: `<article>\n${articleBody}\n</article>` }],
      max_tokens: 2048,
    });
    expect(getAiCacheByUrl).toHaveBeenCalledWith(env.RSS_DATA, url, "summary", DEFAULT_AI_MODEL);
    expect(setAiSummaryByUrl).toHaveBeenCalledWith(
      env.RSS_DATA,
      url,
      "legacy result",
      expect.objectContaining({
        model: DEFAULT_AI_MODEL,
        inputTruncated: false,
        completeness: "unknown",
      }),
    );
    expect(checkSlidingWindow).toHaveBeenCalledWith(
      env.RATE_LIMIT,
      "users/reader/ai-cooldown.json",
      60_000,
      20,
      { failClosed: true },
    );
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it.each([null, "", "@cf/unknown/model", {}, 123])(
    "rejects an explicitly unsupported model %j before side effects",
    async (model) => {
      const response = await execute(model);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_MODEL" });
      expect(getAiCacheByUrl).not.toHaveBeenCalled();
      expect(checkSlidingWindow).not.toHaveBeenCalled();
      expect(fetchArticleContent).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["@cf/qwen/qwen3.8-27b", 5, "low"],
    ["@cf/google/gemma-4-26b-a4b-it", 20, undefined],
    ["@cf/zai-org/glm-5.3", 5, "low"],
  ])("handles chat-completions model %s", async (model, maxCalls, reasoningEffort) => {
    run.mockResolvedValue({ choices: [{ message: { content: "new result" } }] });
    const response = await execute(model, "translation");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "new result" });
    expect(run).toHaveBeenCalledWith(model, {
      messages: [{ role: "user", content: `<article>\n${articleBody}\n</article>` }],
      max_completion_tokens: 2048,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(model === "@cf/google/gemma-4-26b-a4b-it"
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    });
    expect(checkSlidingWindow).toHaveBeenCalledWith(
      env.RATE_LIMIT,
      "users/reader/ai-cooldown.json",
      60_000,
      maxCalls,
      { failClosed: true },
    );
    expect(setAiCacheByUrl).toHaveBeenCalledWith(
      env.RSS_DATA,
      url,
      "new result",
      "translation",
      model,
    );
  });

  it("returns a model-specific cache hit without invoking AI or spending rate limit", async () => {
    vi.mocked(getAiCacheByUrl).mockResolvedValue("cached result");
    const response = await execute("@cf/qwen/qwen3.8-27b");
    expect(await response.json()).toEqual({ result: "cached result" });
    expect(getAiCacheByUrl).toHaveBeenCalledWith(
      env.RSS_DATA,
      url,
      "summary",
      "@cf/qwen/qwen3.8-27b",
    );
    expect(checkSlidingWindow).not.toHaveBeenCalled();
    expect(fetchArticleContent).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("retains the stricter Llama 70B limit", async () => {
    await execute("@cf/meta/llama-3.1-70b-instruct");
    expect(checkSlidingWindow).toHaveBeenCalledWith(
      env.RATE_LIMIT,
      "users/reader/ai-cooldown.json",
      60_000,
      5,
      { failClosed: true },
    );
  });

  it("does not run AI when rate limiting fails closed", async () => {
    vi.mocked(checkSlidingWindow).mockResolvedValue(
      NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    );
    expect((await execute()).status).toBe(429);
    expect(run).not.toHaveBeenCalled();
    expect(setAiCacheByUrl).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { response: { text: "invalid object" } },
    { response: "   " },
    { choices: [] },
    { choices: [{ message: { content: null, reasoning_content: "private reasoning" } }] },
    { choices: [{ message: { content: { text: "invalid object" } } }] },
    { choices: [{ message: { content: "  " } }] },
  ])("rejects malformed or empty provider output without caching %j", async (output) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    run.mockResolvedValue(output);
    const response = await execute();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "AI_ERROR", retryable: true });
    expect(setAiCacheByUrl).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("retains the upstream Retry-After for throttled calls", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    run.mockRejectedValue({ status: 429, headers: { "retry-after": "30" } });
    const response = await execute("@cf/qwen/qwen3.8-27b");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(setAiCacheByUrl).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
