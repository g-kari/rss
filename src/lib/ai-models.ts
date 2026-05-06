export const AI_MODELS = [
  { id: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B（バランス）" },
  { id: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B（高速）" },
  { id: "@cf/meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B（高精度）" },
] as const;

export type WorkersAiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: WorkersAiModelId = "@cf/meta/llama-3.1-8b-instruct";
