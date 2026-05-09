"use client";

import { useState, useCallback } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  isWorkersAiModelId,
  type WorkersAiModelId,
} from "../lib/ai-models";

export const AUTO_READ_THRESHOLD_CYCLE = [70, 80, 90] as const;
export type AutoReadThreshold = (typeof AUTO_READ_THRESHOLD_CYCLE)[number];
const DEFAULT_AUTO_READ_THRESHOLD: AutoReadThreshold = 80;

function loadAutoReadEnabled(): boolean {
  return storageGet(STORAGE_KEYS.AUTO_READ_ENABLED) === "1";
}

function loadAutoReadThreshold(): AutoReadThreshold {
  const stored = storageGet(STORAGE_KEYS.AUTO_READ_THRESHOLD);
  const num = stored == null ? NaN : Number(stored);
  return AUTO_READ_THRESHOLD_CYCLE.includes(num as AutoReadThreshold)
    ? (num as AutoReadThreshold)
    : DEFAULT_AUTO_READ_THRESHOLD;
}

function loadAutoTranslate(): boolean {
  return storageGet(STORAGE_KEYS.AUTO_TRANSLATE) === "1";
}

function loadAutoSummarize(): boolean {
  return storageGet(STORAGE_KEYS.AUTO_SUMMARIZE) === "1";
}

function loadAutoAiBrowserOnly(): boolean {
  // default false (既存挙動維持: ブラウザ AI 不可なら Workers AI へフォールバック)
  return storageGet(STORAGE_KEYS.AUTO_AI_BROWSER_ONLY) === "1";
}

function loadDeduplicateByLink(): boolean {
  const stored = storageGet(STORAGE_KEYS.DEDUP_BY_LINK);
  // デフォルト: true（未設定時は重複排除ON）
  return stored !== "0";
}

function loadAiModel(): WorkersAiModelId {
  const stored = storageGet(STORAGE_KEYS.AI_MODEL);
  return stored && isWorkersAiModelId(stored) ? stored : DEFAULT_AI_MODEL;
}

export { AI_MODELS, type WorkersAiModelId };

export function useAutoReadSettings() {
  const [autoReadEnabled, setAutoReadEnabled] = useState<boolean>(loadAutoReadEnabled);
  const [autoReadThreshold, setAutoReadThreshold] =
    useState<AutoReadThreshold>(loadAutoReadThreshold);
  const [autoTranslate, setAutoTranslate] = useState<boolean>(loadAutoTranslate);
  const [autoSummarize, setAutoSummarize] = useState<boolean>(loadAutoSummarize);
  const [autoAiBrowserOnly, setAutoAiBrowserOnly] = useState<boolean>(loadAutoAiBrowserOnly);
  const [deduplicateByLink, setDeduplicateByLink] = useState<boolean>(loadDeduplicateByLink);
  const [aiModel, setAiModel] = useState<WorkersAiModelId>(loadAiModel);

  const toggleAutoRead = useCallback(() => {
    setAutoReadEnabled((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.AUTO_READ_ENABLED, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleAutoTranslate = useCallback(() => {
    setAutoTranslate((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.AUTO_TRANSLATE, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleAutoSummarize = useCallback(() => {
    setAutoSummarize((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.AUTO_SUMMARIZE, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleAutoAiBrowserOnly = useCallback(() => {
    setAutoAiBrowserOnly((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.AUTO_AI_BROWSER_ONLY, next ? "1" : "0");
      return next;
    });
  }, []);

  const cycleAutoReadThreshold = useCallback(() => {
    setAutoReadThreshold((prev) => {
      const idx = AUTO_READ_THRESHOLD_CYCLE.indexOf(prev);
      const next = AUTO_READ_THRESHOLD_CYCLE[(idx + 1) % AUTO_READ_THRESHOLD_CYCLE.length];
      storageSet(STORAGE_KEYS.AUTO_READ_THRESHOLD, String(next));
      return next;
    });
  }, []);

  const onChangeAutoReadThreshold = useCallback((next: AutoReadThreshold) => {
    setAutoReadThreshold(next);
    storageSet(STORAGE_KEYS.AUTO_READ_THRESHOLD, String(next));
  }, []);

  const toggleDeduplicateByLink = useCallback(() => {
    setDeduplicateByLink((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.DEDUP_BY_LINK, next ? "1" : "0");
      return next;
    });
  }, []);

  const onChangeAiModel = useCallback((next: WorkersAiModelId) => {
    setAiModel(next);
    storageSet(STORAGE_KEYS.AI_MODEL, next);
  }, []);

  return {
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
    autoSummarize,
    toggleAutoSummarize,
    autoAiBrowserOnly,
    toggleAutoAiBrowserOnly,
    deduplicateByLink,
    toggleDeduplicateByLink,
    aiModel,
    onChangeAiModel,
  } as const;
}
