"use client";

import { useState, useCallback } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

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

export function useAutoReadSettings() {
  const [autoReadEnabled, setAutoReadEnabled] = useState<boolean>(loadAutoReadEnabled);
  const [autoReadThreshold, setAutoReadThreshold] =
    useState<AutoReadThreshold>(loadAutoReadThreshold);
  const [autoTranslate, setAutoTranslate] = useState<boolean>(loadAutoTranslate);

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

  return {
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
  } as const;
}
