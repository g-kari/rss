// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractUserTopics, refineUserTopics } from "./recommendation";
import { DEFAULT_AI_MODEL } from "./ai-models";

vi.mock("./shared-feed", () => ({
  readFeedMeta: vi.fn(async () => ({ title: "日本語の開発ニュース" })),
  readLatestArticles: vi.fn(async () => []),
  buildFeedUserMap: vi.fn(),
  R2_CONCURRENCY: 4,
}));

const run = vi.fn();
const ai = { run } as unknown as Ai;
const topics = ["TypeScript", "クラウド", "アニメ"];
beforeEach(() => {
  vi.resetAllMocks();
  run.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(topics) } }] });
});

describe("supported recommendation model contract", () => {
  it("extracts mixed Japanese/English topics with Gemma4 and a bounded completion", async () => {
    const result = await extractUserTopics(
      {} as R2Bucket,
      [{ feedHash: "feed", url: "https://example.com/rss", subscribedAt: "2026-11-08T00:00:00Z" }],
      { entries: [] },
      ai,
    );
    expect(result).toEqual(topics);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      DEFAULT_AI_MODEL,
      expect.objectContaining({
        max_completion_tokens: 256,
        chat_template_kwargs: { enable_thinking: false },
      }),
    );
    expect(run.mock.calls[0][1]).not.toHaveProperty("max_tokens");
  });
  it("refines topics with the same supported response contract", async () => {
    expect(await refineUserTopics(["TypeScript", "技術"], ai)).toEqual(topics);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      DEFAULT_AI_MODEL,
      expect.objectContaining({
        max_completion_tokens: 256,
        chat_template_kwargs: { enable_thinking: false },
      }),
    );
  });
  it("never parses private reasoning as topics", async () => {
    run.mockResolvedValue({
      choices: [{ message: { content: null, reasoning_content: '["秘密"]' } }],
    });
    expect(await refineUserTopics(topics, ai)).toEqual(topics);
  });
  it("strips closed thinking and rejects ambiguous thinking without another call", async () => {
    run.mockResolvedValueOnce({
      choices: [{ message: { content: '<think>["秘密"]</think>["Unity", "日本語"]' } }],
    });
    expect(await refineUserTopics(topics, ai)).toEqual(["Unity", "日本語"]);
    run.mockResolvedValueOnce({ choices: [{ message: { content: '<think>["秘密"]' } }] });
    expect(await refineUserTopics(topics, ai)).toEqual(topics);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
