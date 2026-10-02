import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL, LARGE_MODEL_IDS, isWorkersAiModelId } from "./ai-models";

describe("Workers AI model catalog", () => {
  it("preserves the default and existing choices", () => {
    expect(DEFAULT_AI_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct");
    for (const id of [
      DEFAULT_AI_MODEL,
      "@cf/meta/llama-3.2-3b-instruct",
      "@cf/meta/llama-3.1-70b-instruct",
      "@cf/google/gemma-3-27b-it",
      "@cf/qwen/qwen2.5-coder-1.5b-instruct",
    ]) {
      expect(isWorkersAiModelId(id)).toBe(true);
    }
  });

  it.each([
    "@cf/qwen/qwen3.8-27b",
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/zai-org/glm-5.3",
    "@cf/mistralai/mistral-small-3.1-24b-instruct",
    "@cf/qwen/qwen3-30b-a3b-fp8",
  ])("allows the documented model %s", (model) => {
    expect(isWorkersAiModelId(model)).toBe(true);
  });

  it("labels GLM paid access and applies conservative limits to costly models", () => {
    expect(AI_MODELS.find((model) => String(model.id) === "@cf/zai-org/glm-5.3")?.label).toContain(
      "有料アクセス必須",
    );
    for (const id of [
      "@cf/meta/llama-3.1-70b-instruct",
      "@cf/qwen/qwen3.8-27b",
      "@cf/zai-org/glm-5.3",
    ]) {
      expect(LARGE_MODEL_IDS.has(id)).toBe(true);
    }
  });

  it.each([null, undefined, 123, {}, "", "@cf/unknown/model"])(
    "does not recognize unsupported model %j",
    (value) => expect(isWorkersAiModelId(value)).toBe(false),
  );
});
