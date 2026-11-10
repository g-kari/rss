export const AI_MODELS = [
  // Current selectable contracts verified against the catalog on 2026-11-08.
  // Gemma4 default and replacement contracts verified 2026-11-08.
  // https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/
  { id: "@cf/qwen/qwen3.8-27b", label: "Qwen 3.8 27B（推論・高コスト）" },
  // https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
  { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B A4B（汎用・低コスト）" },
  // https://developers.cloudflare.com/workers-ai/models/glm-5.3/
  { id: "@cf/zai-org/glm-5.3", label: "GLM 5.3（推論・有料アクセス必須）" },
  // Mistral uses the legacy max_tokens / response contract.
  // https://developers.cloudflare.com/workers-ai/models/mistral-small-3.1-24b-instruct/
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    label: "Mistral Small 3.1 24B（多言語・要約）",
  },
] as const;

export type WorkersAiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: WorkersAiModelId = "@cf/google/gemma-4-26b-a4b-it";

/** Never alias these IDs during generation: old clients must select the replacement explicitly. */
export const RETIRED_AI_MODEL_IDS: ReadonlySet<string> = new Set([
  // https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/google/gemma-3-12b-it",
  // https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
]);

/** Catalog search returns no active model and schema GET returns 404; retirement date unknown. */
export const UNAVAILABLE_AI_MODEL_IDS: ReadonlySet<string> = new Set([
  "@cf/google/gemma-3-27b-it",
  "@cf/qwen/qwen2.5-coder-1.5b-instruct",
]);

export const VALID_MODEL_IDS = AI_MODELS.map((m) => m.id) as ReadonlyArray<WorkersAiModelId>;

/** Cost-sensitive models share the existing stricter per-user limit. */
export const LARGE_MODEL_IDS: ReadonlySet<string> = new Set([
  "@cf/qwen/qwen3.8-27b",
  "@cf/zai-org/glm-5.3",
]);

/** These models use max_completion_tokens and choices[].message.content. */
export const CHAT_COMPLETION_MODEL_IDS: ReadonlySet<string> = new Set([
  "@cf/qwen/qwen3.8-27b",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/zai-org/glm-5.3",
]);

/** Both support "low"; keep article tasks within the existing token budget. */
export const REASONING_MODEL_IDS: ReadonlySet<string> = new Set([
  "@cf/qwen/qwen3.8-27b",
  "@cf/zai-org/glm-5.3",
]);

export function isWorkersAiModelId(v: unknown): v is WorkersAiModelId {
  return typeof v === "string" && (VALID_MODEL_IDS as readonly string[]).includes(v);
}
