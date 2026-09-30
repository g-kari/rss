"use client";

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, storageSet } from "../lib/storage";
import {
  aiPreferenceKey,
  isAiProviderPreference,
  loadAiPreferences,
  type AiProviderPreference,
} from "../lib/ai-preferences";
import { isWorkersAiModelId, type WorkersAiModelId } from "../lib/ai-models";

/** Keep AI selection local to this browser and signed-in user. */
export function useAiPreferences(userId: string | null) {
  const [stored, setStored] = useState(() => loadAiPreferences(userId));
  // Never expose the previous account's selection while the effect catches up.
  const preferences = stored.userId === userId ? stored : loadAiPreferences(userId);

  useEffect(() => {
    const reload = () => setStored(loadAiPreferences(userId));
    reload();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === aiPreferenceKey(STORAGE_KEYS.AI_PROVIDER, userId) ||
        event.key === aiPreferenceKey(STORAGE_KEYS.AI_MODEL, userId)
      ) {
        reload();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const onChangeAiProvider = useCallback(
    (provider: AiProviderPreference) => {
      if (!isAiProviderPreference(provider)) return;
      storageSet(aiPreferenceKey(STORAGE_KEYS.AI_PROVIDER, userId), provider);
      setStored((previous) => ({
        ...(previous.userId === userId ? previous : loadAiPreferences(userId)),
        provider,
      }));
    },
    [userId],
  );

  const onChangeAiModel = useCallback(
    (model: WorkersAiModelId) => {
      if (!isWorkersAiModelId(model)) return;
      storageSet(aiPreferenceKey(STORAGE_KEYS.AI_MODEL, userId), model);
      setStored((previous) => ({
        ...(previous.userId === userId ? previous : loadAiPreferences(userId)),
        model,
      }));
    },
    [userId],
  );

  return {
    aiProvider: preferences.provider,
    onChangeAiProvider,
    aiModel: preferences.model,
    onChangeAiModel,
    aiUserId: userId,
  };
}
