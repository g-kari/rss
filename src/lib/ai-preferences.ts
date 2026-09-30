import { DEFAULT_AI_MODEL, isWorkersAiModelId, type WorkersAiModelId } from "./ai-models";
import { STORAGE_KEYS, storageGet } from "./storage";

export type AiProviderPreference = "auto" | "browser" | "workers-ai";

export interface AiPreferences {
  provider: AiProviderPreference;
  model: WorkersAiModelId;
  /** Browser settings and result caches are isolated between signed-in users. */
  userId: string | null;
}

export function isAiProviderPreference(value: unknown): value is AiProviderPreference {
  return value === "auto" || value === "browser" || value === "workers-ai";
}

export function aiPreferenceKey(key: string, userId: string | null): string {
  return `${key}:${JSON.stringify(userId)}`;
}

export function loadAiPreferences(userId: string | null): AiPreferences {
  const provider = storageGet(aiPreferenceKey(STORAGE_KEYS.AI_PROVIDER, userId));
  const model =
    storageGet(aiPreferenceKey(STORAGE_KEYS.AI_MODEL, userId)) ?? storageGet(STORAGE_KEYS.AI_MODEL);
  return {
    provider: isAiProviderPreference(provider) ? provider : "auto",
    // Preserve the model selected before user-scoped settings were introduced.
    model: isWorkersAiModelId(model) ? model : DEFAULT_AI_MODEL,
    userId,
  };
}

export function aiResultCacheKey(
  preferences: AiPreferences,
  articleId: string,
  url: string,
): string {
  return JSON.stringify([
    "v2",
    preferences.userId,
    preferences.provider,
    preferences.provider === "browser" ? "browser" : preferences.model,
    articleId,
    url,
  ]);
}
