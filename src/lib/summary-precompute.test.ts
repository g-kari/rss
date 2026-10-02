// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runSummaryPrecompute,
  runScheduledSummaryPrecompute,
  SUMMARY_PRECOMPUTE_ROLLOUT_ENABLED,
  summaryPrecomputeConfig,
  precomputeReservationMicros,
  type SummaryPrecomputeEnv,
} from "./summary-precompute";
import { getAiSummaryByUrl, setAiSummaryByUrl } from "./ai-cache";
import { claimSummaryGeneration } from "./ai-generation-lease";
import { matchCfCache } from "./cache-helper";
import { DEFAULT_AI_MODEL } from "./ai-models";
import { SUMMARY_PRECOMPUTE_LEASE_KEY } from "./summary-precompute-lease";
import { readFileSync } from "node:fs";

vi.mock("./cache-helper", () => ({ matchCfCache: vi.fn() }));
vi.mock("./fetch-article-content", () => ({
  buildContentCacheKey: async (_origin: string, url: string) => new Request(url),
  fetchArticleContent: vi.fn(async () => "記事の本文の主要な事実です。".repeat(50)),
}));
vi.mock("./html", () => ({ toPlainText: (html: string) => html }));
vi.mock("./server-auth", () => ({
  parseJsonBody: async (request: Request) => ({ ok: true, data: await request.json() }),
}));
vi.mock("./rate-limit", () => ({ checkSlidingWindow: async () => null }));
const model = "@cf/qwen/qwen3-30b-a3b-fp8";
const now = Date.parse("2026-10-02T04:00:00Z");
const url = "https://example.com/article";
const body = "記事の本文の主要な事実です。".repeat(50);
const run = vi.fn();
let store: Map<string, { value: string; etag: string }>;
let bucket: R2Bucket;
let env: SummaryPrecomputeEnv;
let sequence: number;
let conditionalConflict = false;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  sequence = 0;
  conditionalConflict = false;
  store = new Map();
  bucket = {
    get: vi.fn(async (key: string) => {
      const object = store.get(key);
      if (!object) return null;
      return {
        size: object.value.length,
        etag: object.etag,
        text: async () => object.value,
        json: async () => JSON.parse(object.value),
      };
    }),
    put: vi.fn(async (key: string, value: string, options?: R2PutOptions) => {
      const previous = store.get(key);
      const condition = options?.onlyIf;
      if (condition instanceof Headers) {
        if (condition.get("If-None-Match") === "*" && previous) return null;
      } else if (condition?.etagMatches && condition.etagMatches !== previous?.etag) return null;
      if (condition && conditionalConflict) return null;
      const etag = `etag-${++sequence}`;
      store.set(key, { value, etag });
      return { etag };
    }),
  } as unknown as R2Bucket;
  env = {
    RSS_DATA: bucket,
    AI: { run } as unknown as Ai,
    RSS_SUMMARY_PRECOMPUTE_ENABLED: "true",
    RSS_SUMMARY_PRECOMPUTE_MODEL: model,
    RSS_SUMMARY_PRECOMPUTE_RUN_USD: "1",
    RSS_SUMMARY_PRECOMPUTE_DAY_USD: "2",
    RSS_SUMMARY_PRECOMPUTE_MONTH_USD: "3",
    RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES: "2",
    RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES: "100",
    RSS_SUMMARY_PRECOMPUTE_CONCURRENCY: "1",
  };
  run.mockResolvedValue({
    choices: [{ message: { content: "<think>private</think>要約です。" } }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  });
  vi.mocked(matchCfCache).mockImplementation(async () => Response.json({ content: body }));
});
const execute = (urls = [url], scheduledTime = now, clock = now) =>
  runSummaryPrecompute(env, urls, "https://rss.example.com", scheduledTime, clock, () => clock);
const ledger = () => JSON.parse(store.get("ai-cache/summary-budget/2026-10.json")!.value);

describe("summary precompute fail-closed gates", () => {
  it.each([undefined, "false", "TRUE", "1", "invalid"])(
    "OFF or malformed activation does no work %j",
    async (enabled) => {
      env.RSS_SUMMARY_PRECOMPUTE_ENABLED = enabled;
      expect(await execute()).toBe(0);
      expect(bucket.get).not.toHaveBeenCalled();
      expect(bucket.put).not.toHaveBeenCalled();
      expect(matchCfCache).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );
  it.each([
    "RSS_SUMMARY_PRECOMPUTE_MODEL",
    "RSS_SUMMARY_PRECOMPUTE_RUN_USD",
    "RSS_SUMMARY_PRECOMPUTE_DAY_USD",
    "RSS_SUMMARY_PRECOMPUTE_MONTH_USD",
    "RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES",
    "RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES",
  ] as const)("requires explicit %s", async (key) => {
    delete env[key];
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(bucket.get).not.toHaveBeenCalled();
  });
  it.each(["-1", "0", "NaN", "Infinity", "1e3", "0.0000001", " 1", "100000"])(
    "rejects invalid budget %s",
    async (budget) => {
      env.RSS_SUMMARY_PRECOMPUTE_RUN_USD = budget;
      expect(await execute()).toBe(0);
      expect(run).not.toHaveBeenCalled();
    },
  );
  it("requires ordered run/day/month limits", () => {
    env.RSS_SUMMARY_PRECOMPUTE_RUN_USD = "4";
    expect(summaryPrecomputeConfig(env, now)).toBeNull();
  });
  it("unsupported or stale price bounds prevent any generation", async () => {
    env.RSS_SUMMARY_PRECOMPUTE_MODEL = DEFAULT_AI_MODEL;
    expect(await execute()).toBe(0);
    env.RSS_SUMMARY_PRECOMPUTE_MODEL = model;
    expect(
      await execute([url], Date.parse("2026-11-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z")),
    ).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
  it("supports freshly priced Gemma4, Mistral and Qwen conservatively", () => {
    expect(precomputeReservationMicros("@cf/google/gemma-4-26b-a4b-it", now)).toBe(26215);
    expect(precomputeReservationMicros("@cf/mistralai/mistral-small-3.1-24b-instruct", now)).toBe(
      46065,
    );
    expect(precomputeReservationMicros(model, now)).toBe(2354);
  });
  it.each([
    null,
    { content: "" },
    { content: "short" },
    { content: "x".repeat(500001) },
    { content: 42 },
  ])("does not generate for unavailable/empty/short bodies %j", async (value) => {
    vi.mocked(matchCfCache).mockResolvedValue(value === null ? null : Response.json(value));
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
  });
  it("rejects invalid URL and scheduled timestamps before inference", async () => {
    expect(await execute(["http://127.0.0.1/"])).toBe(0);
    expect(await execute([url], now - 3600001)).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("summary reservations and R2 generation CAS", () => {
  it("generates safe text with versioned provenance and cached repeat uses no AI", async () => {
    expect(await execute()).toBe(1);
    const cached = await getAiSummaryByUrl(bucket, url, model);
    expect(cached).toMatchObject({
      result: "要約です。",
      metadata: {
        version: 1,
        model,
        promptVersion: "article-summary-v2",
        inputTruncated: false,
        completeness: "unknown",
        usage: { inputTokens: 100, outputTokens: 10 },
      },
    });
    expect(cached!.metadata.bodyHash).toMatch(/^[a-f0-9]{64}$/);
    expect([...store.values()].map((entry) => entry.value).join("")).not.toContain("private");
    expect(await execute()).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(ledger().micros).toBe(2354);
  });
  it("records input truncation without claiming complete body coverage", async () => {
    vi.mocked(matchCfCache).mockResolvedValue(Response.json({ content: "本文".repeat(5000) }));
    expect(await execute()).toBe(1);
    expect((await getAiSummaryByUrl(bucket, url, model))!.metadata).toMatchObject({
      inputCharacters: 8000,
      inputTruncated: true,
      completeness: "truncated",
    });
  });
  it("concurrent calls for a URL produce one generation", async () => {
    await Promise.all([execute(), execute()]);
    expect(run).toHaveBeenCalledOnce();
  });
  it("generation lease CAS admits only one owner", async () => {
    const claims = await Promise.all([
      claimSummaryGeneration(bucket, url, model),
      claimSummaryGeneration(bucket, url, model),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      await claimSummaryGeneration(bucket, url, "@cf/mistralai/mistral-small-3.1-24b-instruct"),
    ).not.toBeNull();
  });
  it("CAS conflicts produce zero inference", async () => {
    conditionalConflict = true;
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
  it("R2 errors fail closed and never call AI", async () => {
    vi.mocked(bucket.put).mockRejectedValue(new Error("storage unavailable"));
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
  it("retains reservations and pending claim after an ambiguous AI failure", async () => {
    run.mockRejectedValue(new Error("upstream transport failure"));
    expect(await execute()).toBe(0);
    expect(ledger().micros).toBe(2354);
    expect(await execute()).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(await getAiSummaryByUrl(bucket, url, model)).toBeNull();
  });
  it.each(["<think>private", "<think>private</think>", "   "])(
    "does not cache unsafe or empty output %s",
    async (output) => {
      run.mockResolvedValue({ choices: [{ message: { content: output } }] });
      expect(await execute()).toBe(0);
      expect(await getAiSummaryByUrl(bucket, url, model)).toBeNull();
      expect(await execute()).toBe(0);
      expect(run).toHaveBeenCalledOnce();
    },
  );
  it("does not refund a failed reservation or retry unsupported usage", async () => {
    run.mockResolvedValue({
      choices: [{ message: { content: "要約" } }],
      usage: { prompt_tokens: 32769, completion_tokens: 5 },
    });
    expect(await execute()).toBe(0);
    expect(ledger().micros).toBe(2354);
    expect(await getAiSummaryByUrl(bucket, url, model)).toBeNull();
  });
  it("checks run, day and month budget before AI", async () => {
    for (const key of [
      "RSS_SUMMARY_PRECOMPUTE_RUN_USD",
      "RSS_SUMMARY_PRECOMPUTE_DAY_USD",
      "RSS_SUMMARY_PRECOMPUTE_MONTH_USD",
    ] as const) {
      env.RSS_SUMMARY_PRECOMPUTE_RUN_USD = "0.002353";
      env.RSS_SUMMARY_PRECOMPUTE_DAY_USD = "0.002353";
      env.RSS_SUMMARY_PRECOMPUTE_MONTH_USD = "0.002353";
      env[key] = "0.002353";
      expect(await execute()).toBe(0);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("persists day/month totals across run IDs, and limits count per shared run", async () => {
    env.RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES = "1";
    env.RSS_SUMMARY_PRECOMPUTE_DAY_USD = "0.004708";
    env.RSS_SUMMARY_PRECOMPUTE_RUN_USD = "0.002354";
    expect(await execute()).toBe(1);
    expect(await execute([url + "/2"])).toBe(0);
    expect(await execute([url + "/2"], now + 1000)).toBe(1);
    expect(await execute([url + "/3"], now + 2000)).toBe(0);
    expect(ledger().micros).toBe(4708);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("corrupted usage ledger is not reset to a free budget", async () => {
    store.set("ai-cache/summary-budget/2026-10.json", {
      value: JSON.stringify({ version: 2 }),
      etag: "old",
    });
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
  it("legacy model-specific cached text is reused with unknown completeness", async () => {
    const { setAiCacheByUrl } = await import("./ai-cache");
    await setAiCacheByUrl(bucket, url, "legacy summary", "summary", model);
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect((await getAiSummaryByUrl(bucket, url, model))!.metadata).toMatchObject({
      completeness: "unknown",
      bodyHash: null,
      inputTruncated: null,
    });
  });
  it("cache results and generation remain isolated by model", async () => {
    await setAiSummaryByUrl(bucket, url, "other model", {
      version: 1,
      model: DEFAULT_AI_MODEL,
      promptVersion: "v2",
      bodyHash: "a".repeat(64),
      generatedAt: new Date(now).toISOString(),
      inputCharacters: 300,
      inputTruncated: false,
      completeness: "unknown",
      usage: null,
    });
    expect(await execute()).toBe(1);
    expect((await getAiSummaryByUrl(bucket, url, DEFAULT_AI_MODEL))!.result).toBe("other model");
    expect((await getAiSummaryByUrl(bucket, url, model))!.result).toBe("要約です。");
  });
});

describe("summary generation recovery", () => {
  it("terminal inference failure can be retried manually after cooldown, never by cron", async () => {
    const { failSummaryGeneration, summaryGenerationRetryAfter } =
      await import("./ai-generation-lease");
    const claim = await claimSummaryGeneration(bucket, url, model);
    await failSummaryGeneration(bucket, claim!, now);
    expect(await summaryGenerationRetryAfter(bucket, url, model, now)).toBe(300);
    expect(
      await claimSummaryGeneration(bucket, url, model, { retryFailed: true, now: now + 299999 }),
    ).toBeNull();
    expect(await claimSummaryGeneration(bucket, url, model, { now: now + 300000 })).toBeNull();
    const retry = await claimSummaryGeneration(bucket, url, model, {
      retryFailed: true,
      now: now + 300000,
    });
    expect(retry).not.toBeNull();
    expect(
      await claimSummaryGeneration(bucket, url, model, { retryFailed: true, now: now + 600000 }),
    ).toBeNull();
  });
  it("an active claim never expires while a call can still be in flight", async () => {
    const { summaryGenerationRetryAfter } = await import("./ai-generation-lease");
    await claimSummaryGeneration(bucket, url, model);
    expect(
      await claimSummaryGeneration(bucket, url, model, { retryFailed: true, now: now + 86400000 }),
    ).toBeNull();
    expect(await summaryGenerationRetryAfter(bucket, url, model, now + 86400000)).toBeNull();
  });
  it("post-inference cache write failure retains pending operator-recovery claim", async () => {
    const put = vi.mocked(bucket.put).getMockImplementation()!;
    vi.mocked(bucket.put).mockImplementation(async (...args) => {
      if (args[0].startsWith("ai-cache/summary-v1/model-url-"))
        throw new Error("ambiguous cache write");
      return put(...args);
    });
    expect(await execute()).toBe(0);
    expect(
      await claimSummaryGeneration(bucket, url, model, { retryFailed: true, now: now + 86400000 }),
    ).toBeNull();
    expect(run).toHaveBeenCalledOnce();
  });
  it("cached leading candidates do not starve later prefetched articles", async () => {
    const { setAiCacheByUrl } = await import("./ai-cache");
    env.RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES = "1";
    await setAiCacheByUrl(bucket, url, "cached first", "summary", model);
    expect(await execute([url, url + "/later"])).toBe(1);
    expect((await getAiSummaryByUrl(bucket, url + "/later", model))!.result).toBe("要約です。");
  });
});

describe("ledger and run integrity", () => {
  it("rejects delayed schedules across UTC month boundaries before storage or AI", async () => {
    const clock = Date.parse("2026-10-01T00:05:00Z");
    const scheduledTime = Date.parse("2026-09-30T23:30:00Z");
    expect(await execute([url], scheduledTime, clock)).toBe(0);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it.each([
    {
      version: 1,
      month: "2026-10",
      micros: 0,
      days: { "2026-10-01": 2354 },
      runs: { "2026-10-01T04:00:00.000Z": { micros: 2354, calls: 1 } },
    },
    {
      version: 1,
      month: "2026-10",
      micros: 2354,
      days: { "2026-10-32": 2354 },
      runs: { "2026-10-01T04:00:00.000Z": { micros: 2354, calls: 1 } },
    },
    {
      version: 1,
      month: "2026-10",
      micros: 2354,
      days: { "2026-10-01": 2354 },
      runs: { "not-a-run": { micros: 2354, calls: 1 } },
    },
    {
      version: 1,
      month: "2026-10",
      micros: 2354,
      days: { "2026-10-01": 2354 },
      runs: { "2026-10-01T04:00:00.000Z": { micros: 2354, calls: 0 } },
    },
  ])("does not admit internally inconsistent accounting %j", async (entry) => {
    store.set("ai-cache/summary-budget/2026-10.json", {
      value: JSON.stringify(entry),
      etag: "corrupt",
    });
    expect(await execute()).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("shared manual and cron generation ownership", () => {
  it("a manual request and cron race cause only one inference and one safe cache", async () => {
    const { runAiJob } = await import("./ai-route-helper");
    const waitUntil = vi.fn();
    const manual = runAiJob(
      new Request("https://rss.example.com/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ url, model }),
      }),
      { userId: "reader" },
      { ...env, RATE_LIMIT: {} as KVNamespace },
      { waitUntil } as unknown as ExecutionContext,
      (plain) => [{ role: "user", content: plain }],
    );
    const [response] = await Promise.all([manual, execute()]);
    expect([200, 409]).toContain(response.status);
    await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));
    expect(run).toHaveBeenCalledOnce();
    expect((await getAiSummaryByUrl(bucket, url, model))!.result).toBe("要約です。");
  });
});

describe("approved scheduled rollout", () => {
  function approvedEnv(): SummaryPrecomputeEnv {
    const config = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
    for (const line of config.split("\n")) {
      const match = /^(RSS_SUMMARY_PRECOMPUTE_\w+) = "([^"]+)"$/.exec(line);
      if (match) Object.assign(env, { [match[1]]: match[2] });
    }
    vi.spyOn(Date, "now").mockReturnValue(now);
    return env;
  }
  const scheduled = (urls = [url], time = now) =>
    runScheduledSummaryPrecompute(env, urls, "https://rss.example.com", time);

  it("ships the approved explicit limits and enables the guarded scheduled path", async () => {
    expect(SUMMARY_PRECOMPUTE_ROLLOUT_ENABLED).toBe(true);
    expect(approvedEnv()).toMatchObject({
      RSS_SUMMARY_PRECOMPUTE_ENABLED: "true",
      RSS_SUMMARY_PRECOMPUTE_MODEL: "@cf/google/gemma-4-26b-a4b-it",
      RSS_SUMMARY_PRECOMPUTE_RUN_USD: "0.131075",
      RSS_SUMMARY_PRECOMPUTE_DAY_USD: "1",
      RSS_SUMMARY_PRECOMPUTE_MONTH_USD: "1",
      RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES: "5",
      RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES: "100",
      RSS_SUMMARY_PRECOMPUTE_CONCURRENCY: "1",
    });
    expect(await scheduled()).toBe(1);
    expect(run.mock.calls[0][0]).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(ledger().micros).toBe(26215);
  });
  it.each([
    ["RSS_SUMMARY_PRECOMPUTE_ENABLED", "false"],
    ["RSS_SUMMARY_PRECOMPUTE_MONTH_USD", undefined],
    ["RSS_SUMMARY_PRECOMPUTE_MODEL", model],
    ["RSS_SUMMARY_PRECOMPUTE_RUN_USD", "0.2"],
    ["RSS_SUMMARY_PRECOMPUTE_MONTH_USD", "1.000001"],
    ["RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES", "6"],
    ["RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES", "101"],
    ["RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES", "1e2"],
    ["RSS_SUMMARY_PRECOMPUTE_CONCURRENCY", "2"],
    ["RSS_SUMMARY_PRECOMPUTE_CONCURRENCY", undefined],
  ] as const)("rejects unapproved/missing %s=%s before storage and AI", async (key, value) => {
    approvedEnv();
    env[key] = value;
    expect(await scheduled()).toBe(0);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(matchCfCache).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("serializes distinct overlapping cron runs globally, then releases after settlement", async () => {
    approvedEnv();
    let resolve!: (output: unknown) => void;
    run.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const first = scheduled();
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(await scheduled([url + "/different"], now + 1000)).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    resolve({ choices: [{ message: { content: "要約" } }] });
    expect(await first).toBe(1);
    expect(await scheduled([url + "/different"], now + 1000)).toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("retains an ambiguous global release as an operator hold", async () => {
    approvedEnv();
    const completed = vi.spyOn(console, "info");
    const put = vi.mocked(bucket.put).getMockImplementation()!;
    vi.mocked(bucket.put).mockImplementation(async (...args) => {
      if (
        args[0] === SUMMARY_PRECOMPUTE_LEASE_KEY &&
        JSON.parse(String(args[1])).status === "finished"
      )
        throw new Error("ambiguous release");
      return put(...args);
    });
    expect(await scheduled()).toBe(0);
    expect(JSON.parse(store.get(SUMMARY_PRECOMPUTE_LEASE_KEY)!.value).status).toBe("pending");
    expect(await scheduled([url + "/different"], now + 1000)).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(ledger().micros).toBe(26215);
    expect(completed).not.toHaveBeenCalled();
  });
  it("rejects malformed global lease and CAS conflicts without inference", async () => {
    approvedEnv();
    store.set(SUMMARY_PRECOMPUTE_LEASE_KEY, {
      value: JSON.stringify({ status: "finished" }),
      etag: "bad",
    });
    expect(await scheduled()).toBe(0);
    store.clear();
    conditionalConflict = true;
    expect(await scheduled()).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(matchCfCache).not.toHaveBeenCalled();
  });
  it("USD 1 monthly admits at most 38 reservations, five per run", async () => {
    approvedEnv();
    for (let batch = 0; batch < 8; batch++) {
      const time = now + batch * 30 * 60 * 1000;
      vi.mocked(Date.now).mockReturnValue(time);
      const urls = Array.from({ length: 6 }, (_, index) => url + "/" + batch + "/" + index);
      expect(await scheduled(urls, time)).toBe(batch === 7 ? 3 : 5);
    }
    expect(await scheduled([url + "/exhausted"], now + 8 * 30 * 60 * 1000)).toBe(0);
    expect(run).toHaveBeenCalledTimes(38);
    expect(ledger().micros).toBe(996170);
    expect(
      Object.values(ledger().runs).every(
        (entry: unknown) => (entry as { calls: number }).calls <= 5,
      ),
    ).toBe(true);
  });
  it("cache misses and OFF retain zero AI calls after activation", async () => {
    approvedEnv();
    vi.mocked(matchCfCache).mockResolvedValue(null);
    expect(await scheduled()).toBe(0);
    env.RSS_SUMMARY_PRECOMPUTE_ENABLED = "false";
    expect(await scheduled([url + "/other"])).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(store.has("ai-cache/summary-budget/2026-10.json")).toBe(false);
  });
});

describe("daily article and clock boundaries", () => {
  it("retains a reservation but skips inference if ledger I/O crosses price expiry", async () => {
    const start = Date.parse("2026-10-31T23:59:59Z");
    let time = start;
    const put = vi.mocked(bucket.put).getMockImplementation()!;
    vi.mocked(bucket.put).mockImplementation(async (...args) => {
      const result = await put(...args);
      if (args[0] === "ai-cache/summary-budget/2026-10.json") time = start + 2000;
      return result;
    });
    expect(
      await runSummaryPrecompute(env, [url], "https://rss.example.com", start, start, () => time),
    ).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(ledger().micros).toBe(2354);
    expect(await claimSummaryGeneration(bucket, url, model)).not.toBeNull();
  });
  it("daily 100 counts failed reservations across distinct runs", async () => {
    env.RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES = "1";
    const runs = Object.fromEntries(
      Array.from({ length: 99 }, (_, index) => [
        new Date(Date.parse("2026-10-02T00:00:00Z") + index * 1000).toISOString(),
        { micros: 2354, calls: 1 },
      ]),
    );
    store.set("ai-cache/summary-budget/2026-10.json", {
      value: JSON.stringify({
        version: 1,
        month: "2026-10",
        micros: 99 * 2354,
        days: { "2026-10-02": 99 * 2354 },
        runs,
      }),
      etag: "seed",
    });
    run.mockRejectedValueOnce(new Error("terminal failure"));
    expect(await execute()).toBe(0);
    expect(await execute([url + "/101"], now + 1000)).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(ledger().micros).toBe(100 * 2354);
    const nextDay = Date.parse("2026-10-03T04:00:00Z");
    expect(await execute([url + "/next-day"], nextDay, nextDay)).toBe(1);
  });
  it("does not assign a delayed prior-day run to a new daily counter", async () => {
    const clock = Date.parse("2026-10-03T00:05:00Z");
    expect(await execute([url], clock - 10 * 60 * 1000, clock)).toBe(0);
    expect(bucket.put).not.toHaveBeenCalled();
  });
  it("checks expiry and the UTC day again immediately before reservation", async () => {
    const start = Date.parse("2026-10-31T23:59:59Z");
    const clock = vi.fn().mockReturnValue(start);
    run.mockImplementationOnce(async () => {
      clock.mockReturnValue(start + 2000);
      return { choices: [{ message: { content: "要約" } }] };
    });
    expect(
      await runSummaryPrecompute(
        env,
        [url, url + "/next"],
        "https://rss.example.com",
        start,
        start,
        clock,
      ),
    ).toBe(1);
    expect(run).toHaveBeenCalledOnce();
  });
});
