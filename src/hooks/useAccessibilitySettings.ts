"use client";

import { useState, useCallback } from "react";
import { STORAGE_KEYS, storageGet, storageSet, loadStoredEnum } from "../lib/storage";
import { LINE_HEIGHT_CYCLE, type LineHeight } from "../lib/reader-settings";
import { useStoredSetting } from "./useStoredSetting";

const loadLineHeight = () =>
  loadStoredEnum(STORAGE_KEYS.LINE_HEIGHT, LINE_HEIGHT_CYCLE, "normal" as LineHeight);

function loadTextJustify(): boolean {
  return storageGet(STORAGE_KEYS.TEXT_JUSTIFY) === "true";
}

/**
 * アクセシビリティ設定 (line-height / textJustify / fontFamily / 等) を localStorage に永続化しつつ管理する hook。
 * @returns 各設定値 + setter callback (`{ lineHeight, onChangeLineHeight, textJustify, toggleTextJustify, ... }`)
 */
export function useAccessibilitySettings() {
  const [lineHeight, onChangeLineHeight] = useStoredSetting<LineHeight>(
    loadLineHeight,
    STORAGE_KEYS.LINE_HEIGHT,
  );
  const [textJustify, setTextJustifyState] = useState<boolean>(loadTextJustify);

  const onChangeTextJustify = useCallback((v: boolean) => {
    setTextJustifyState(v);
    storageSet(STORAGE_KEYS.TEXT_JUSTIFY, String(v));
  }, []);

  return {
    lineHeight,
    onChangeLineHeight,
    textJustify,
    onChangeTextJustify,
  } as const;
}
