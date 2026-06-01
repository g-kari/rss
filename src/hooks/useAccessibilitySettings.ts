"use client";

import { STORAGE_KEYS, storageGet, loadStoredEnum } from "../lib/storage";
import { LINE_HEIGHT_CYCLE, type LineHeight } from "../lib/reader-settings";
import { useStoredSetting, useStoredBoolSetter } from "./useStoredSetting";

const loadLineHeight = () =>
  loadStoredEnum(STORAGE_KEYS.LINE_HEIGHT, LINE_HEIGHT_CYCLE, "normal" as LineHeight);

// "1"/"0" に正規化済み。旧 "true"/"false" 値は移行読み込みで許容する。
const loadTextJustify = () => {
  const v = storageGet(STORAGE_KEYS.TEXT_JUSTIFY);
  return v === "1" || v === "true";
};

/**
 * アクセシビリティ設定 (line-height / textJustify / fontFamily / 等) を localStorage に永続化しつつ管理する hook。
 * @returns 各設定値 + setter callback (`{ lineHeight, onChangeLineHeight, textJustify, toggleTextJustify, ... }`)
 */
export function useAccessibilitySettings() {
  const [lineHeight, onChangeLineHeight] = useStoredSetting<LineHeight>(
    loadLineHeight,
    STORAGE_KEYS.LINE_HEIGHT,
  );
  const [textJustify, onChangeTextJustify] = useStoredBoolSetter(
    loadTextJustify,
    STORAGE_KEYS.TEXT_JUSTIFY,
  );

  return {
    lineHeight,
    onChangeLineHeight,
    textJustify,
    onChangeTextJustify,
  } as const;
}
