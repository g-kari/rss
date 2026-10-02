// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAiCacheByUrl, setAiCacheByUrl, getAiSummaryByUrl, setAiSummaryByUrl } from "./ai-cache";
import { DEFAULT_AI_MODEL } from "./ai-models";
import { sha256Hex } from "./r2";

const url = "https://example.com/article";
const otherModel = "@cf/meta/llama-3.2-3b-instruct";
let data: Map<string, string>;
let bucket: R2Bucket;

beforeEach(() => {
  data = new Map();
  bucket = {
    get: vi.fn(async (key: string) =>
      data.has(key) ? { text: async () => data.get(key)! } : null,
    ),
    put: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
  } as unknown as R2Bucket;
});

describe("AI cache model isolation", () => {
  it("preserves legacy keys for callers without a model", async () => {
    await setAiCacheByUrl(bucket, url, "legacy");
    expect(await getAiCacheByUrl(bucket, url)).toBe("legacy");
    expect(data.has(`ai-cache/summary/url-${await sha256Hex(url)}`)).toBe(true);
  });

  it("does not use a legacy result whose model is unknown", async () => {
    await setAiCacheByUrl(bucket, url, "legacy");
    expect(await getAiCacheByUrl(bucket, url, "summary", DEFAULT_AI_MODEL)).toBeNull();
  });

  it("partitions results by model, operation and article URL", async () => {
    await setAiCacheByUrl(bucket, url, "default summary", "summary", DEFAULT_AI_MODEL);
    await setAiCacheByUrl(bucket, url, "other summary", "summary", otherModel);
    await setAiCacheByUrl(bucket, url, "default translation", "translation", DEFAULT_AI_MODEL);
    await setAiCacheByUrl(bucket, `${url}/other`, "other article", "summary", DEFAULT_AI_MODEL);

    expect(await getAiCacheByUrl(bucket, url, "summary", DEFAULT_AI_MODEL)).toBe("default summary");
    expect(await getAiCacheByUrl(bucket, url, "summary", otherModel)).toBe("other summary");
    expect(await getAiCacheByUrl(bucket, url, "translation", DEFAULT_AI_MODEL)).toBe(
      "default translation",
    );
    expect(await getAiCacheByUrl(bucket, `${url}/other`, "summary", DEFAULT_AI_MODEL)).toBe(
      "other article",
    );
    expect(await getAiCacheByUrl(bucket, url)).toBeNull();
    expect(data.size).toBe(4);
  });
});

describe("versioned summary cache", () => {
  const metadata = {
    version: 1 as const,
    model: DEFAULT_AI_MODEL,
    promptVersion: "article-summary-v2",
    bodyHash: "a".repeat(64),
    generatedAt: "2026-10-02T04:00:00Z",
    inputCharacters: 8000,
    inputTruncated: true,
    completeness: "truncated" as const,
    usage: { inputTokens: 2000, outputTokens: 500 },
  };
  it("round trips safe text and provenance without changing legacy string readers", async () => {
    await setAiSummaryByUrl(bucket, url, "<think>private</think>summary", metadata);
    expect(await getAiCacheByUrl(bucket, url, "summary", DEFAULT_AI_MODEL)).toBe("summary");
    expect(await getAiSummaryByUrl(bucket, url, DEFAULT_AI_MODEL)).toEqual({
      result: "summary",
      metadata,
    });
    expect([...data.values()].join("")).not.toContain("private");
  });
  it("legacy text is visibly unknown, never claimed complete or assigned a fake timestamp", async () => {
    await setAiCacheByUrl(bucket, url, "old", "summary", DEFAULT_AI_MODEL);
    expect((await getAiSummaryByUrl(bucket, url, DEFAULT_AI_MODEL))!.metadata).toMatchObject({
      completeness: "unknown",
      inputTruncated: null,
      generatedAt: null,
      bodyHash: null,
      promptVersion: null,
    });
  });
  it("rejects malformed metadata and unsupported envelope version", async () => {
    const key = `ai-cache/summary-v1/model-url-${await sha256Hex(JSON.stringify([DEFAULT_AI_MODEL, url]))}`;
    for (const patch of [
      { version: 2 },
      { metadata: { ...metadata, model: otherModel } },
      { metadata: { ...metadata, usage: { inputTokens: -1, outputTokens: 2 } } },
      { metadata: { ...metadata, completeness: "complete" } },
    ]) {
      data.set(
        key,
        JSON.stringify({
          kind: "article-summary",
          version: 1,
          result: "summary",
          metadata,
          ...patch,
        }),
      );
      expect(await getAiSummaryByUrl(bucket, url, DEFAULT_AI_MODEL)).toBeNull();
    }
  });
  it("rejects unclosed and escaped thinking traces, including legacy cached output", async () => {
    const key = `ai-cache/summary/model-url-${await sha256Hex(JSON.stringify([DEFAULT_AI_MODEL, url]))}`;
    for (const text of ["<think>private", "&lt;think&gt;private&lt;/think&gt;summary"]) {
      data.set(key, text);
      expect(await getAiSummaryByUrl(bucket, url, DEFAULT_AI_MODEL)).toBeNull();
    }
  });
});
