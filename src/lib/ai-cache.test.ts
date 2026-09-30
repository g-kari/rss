// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAiCacheByUrl, setAiCacheByUrl } from "./ai-cache";
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
