import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL, LARGE_MODEL_IDS, isWorkersAiModelId } from "./ai-models";

describe("Workers AI model catalog", () => {
  it("uses the supported low-cost default", () => {
    expect(DEFAULT_AI_MODEL).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(isWorkersAiModelId(DEFAULT_AI_MODEL)).toBe(true);
    expect(AI_MODELS).toHaveLength(4);
  });

  it.each([
    "@cf/qwen/qwen3.8-27b",
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/zai-org/glm-5.3",
    "@cf/mistralai/mistral-small-3.1-24b-instruct",
  ])("allows the documented model %s", (model) => {
    expect(isWorkersAiModelId(model)).toBe(true);
  });

  it("labels GLM paid access and applies conservative limits to costly models", () => {
    expect(AI_MODELS.find((model) => String(model.id) === "@cf/zai-org/glm-5.3")?.label).toContain(
      "有料アクセス必須",
    );
    for (const id of ["@cf/qwen/qwen3.8-27b", "@cf/zai-org/glm-5.3"]) {
      expect(LARGE_MODEL_IDS.has(id)).toBe(true);
    }
  });

  it.each([
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/meta/llama-3.1-70b-instruct",
    "@cf/google/gemma-3-12b-it",
    "@cf/meta/llama-3.2-3b-instruct",
    "@cf/qwen/qwen3-30b-a3b-fp8",
  ])("never offers retired model %s for generation", (id) => {
    expect(isWorkersAiModelId(id)).toBe(false);
    expect(LARGE_MODEL_IDS.has(id)).toBe(false);
  });

  it.each(["@cf/google/gemma-3-27b-it", "@cf/qwen/qwen2.5-coder-1.5b-instruct"])(
    "never offers unavailable model %s for generation",
    (id) => {
      expect(isWorkersAiModelId(id)).toBe(false);
    },
  );

  it.each([null, undefined, 123, {}, "", "@cf/unknown/model"])(
    "does not recognize unsupported model %j",
    (value) => expect(isWorkersAiModelId(value)).toBe(false),
  );
});
