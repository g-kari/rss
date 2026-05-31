export const AI_MODELS = [
  { id: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B（バランス）" },
  { id: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B（高速）" },
  { id: "@cf/meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B（高精度）" },
  { id: "@cf/google/gemma-3-27b-it", label: "Gemma 3 27B（多言語・日本語向き）" },
  { id: "@cf/qwen/qwen2.5-coder-1.5b-instruct", label: "Qwen 2.5 Coder 1.5B（コード記事向き）" },
] as const;

export type WorkersAiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: WorkersAiModelId = "@cf/meta/llama-3.1-8b-instruct";

export const VALID_MODEL_IDS = AI_MODELS.map((m) => m.id) as ReadonlyArray<WorkersAiModelId>;

export const LARGE_MODEL_IDS: ReadonlySet<string> = new Set(["@cf/meta/llama-3.1-70b-instruct"]);

export function isWorkersAiModelId(v: unknown): v is WorkersAiModelId {
  return typeof v === "string" && (VALID_MODEL_IDS as readonly string[]).includes(v);
}
