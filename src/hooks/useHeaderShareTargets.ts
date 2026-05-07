"use client";

import { useState, useCallback } from "react";
import { loadJson, saveJson, STORAGE_KEYS } from "../lib/storage";
import type { ShareTargetId } from "../components/article-view/shareTargets";

const DEFAULT_HEADER_SHARE_TARGETS: ShareTargetId[] = [];

export function useHeaderShareTargets(): [ShareTargetId[], (ids: ShareTargetId[]) => void] {
  const [targets, setTargets] = useState<ShareTargetId[]>(() =>
    loadJson<ShareTargetId[]>(STORAGE_KEYS.HEADER_SHARE_TARGETS, DEFAULT_HEADER_SHARE_TARGETS),
  );

  const onChange = useCallback((ids: ShareTargetId[]) => {
    setTargets(ids);
    saveJson(STORAGE_KEYS.HEADER_SHARE_TARGETS, ids);
  }, []);

  return [targets, onChange];
}
