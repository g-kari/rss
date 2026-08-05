"use client";

import { useState, useCallback } from "react";
import { loadJsonArray, saveJson, STORAGE_KEYS } from "../lib/storage";
import type { ShareTargetId } from "../components/article-view/shareTargets";

const DEFAULT_HEADER_SHARE_TARGETS: ShareTargetId[] = [];

const VALID_SHARE_TARGET_IDS: ReadonlySet<string> = new Set([
  "x",
  "bluesky",
  "line",
  "hatena",
  "email",
  "slack",
  "discord",
]);
export const isShareTargetId = (v: unknown): v is ShareTargetId =>
  typeof v === "string" && VALID_SHARE_TARGET_IDS.has(v);

export function useHeaderShareTargets(): [ShareTargetId[], (ids: ShareTargetId[]) => void] {
  const [targets, setTargets] = useState<ShareTargetId[]>(() =>
    loadJsonArray<ShareTargetId>(
      STORAGE_KEYS.HEADER_SHARE_TARGETS,
      DEFAULT_HEADER_SHARE_TARGETS,
      isShareTargetId,
    ),
  );

  const onChange = useCallback((ids: ShareTargetId[]) => {
    setTargets(ids);
    saveJson(STORAGE_KEYS.HEADER_SHARE_TARGETS, ids);
  }, []);

  return [targets, onChange];
}
