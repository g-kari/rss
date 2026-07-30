"use client";

import { useState, useCallback } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import {
  parseThemePresets,
  serializeThemePresets,
  capPresetsByRecent,
  type ThemePreset,
} from "../lib/theme-preset";

/**
 * `useThemePresets` の戻り値型。
 *
 * - `presets`: 現在保存済の preset 一覧 (createdAt は API 内部状態、UI 側で sort 自由)
 * - `savePreset`: 現在の設定 snapshot + ユーザー指定 name で新規 preset 保存
 *   (id / createdAt は hook 内で自動生成、上限超過時は最古を切り捨て)
 * - `deletePreset`: 指定 id の preset を削除
 */
interface UseThemePresetsResult {
  presets: ThemePreset[];
  savePreset: (name: string, snapshot: Omit<ThemePreset, "id" | "name" | "createdAt">) => void;
  deletePreset: (id: string) => void;
}

function loadPresets(): ThemePreset[] {
  return parseThemePresets(storageGet(STORAGE_KEYS.THEME_PRESETS));
}

function persistPresets(presets: ThemePreset[]): void {
  storageSet(STORAGE_KEYS.THEME_PRESETS, serializeThemePresets(presets));
}

/**
 * Theme preset (theme + font + layout 組み合わせの名前付き保存) を localStorage で
 * 永続化する hook。`useStoredSetting` パターン (useState(load) + storageSet) に準拠。
 *
 * - `MAX_THEME_PRESETS` (20 件) を上限とし、超過時は serialize で createdAt 古い順に切り捨て
 * - `savePreset` は id (crypto.randomUUID) と createdAt (Date.now) を内部で生成
 * - 削除は id 一致で filter
 */
export function useThemePresets(): UseThemePresetsResult {
  const [presets, setPresets] = useState<ThemePreset[]>(loadPresets);

  const savePreset = useCallback(
    (name: string, snapshot: Omit<ThemePreset, "id" | "name" | "createdAt">) => {
      setPresets((prev) => {
        const id = crypto.randomUUID();
        const next: ThemePreset = {
          id,
          name,
          theme: snapshot.theme,
          fontSize: snapshot.fontSize,
          fontFamily: snapshot.fontFamily,
          lineHeight: snapshot.lineHeight,
          contentWidth: snapshot.contentWidth,
          createdAt: Date.now(),
        };
        // 上限超過時は serializeThemePresets が古い順に切り捨てるが、state も同じ scope に
        // 揃えて保存後の visible state が persisted state と一致するようにする。
        // 両者が構造的に同期するよう cap ロジックは capPresetsByRecent canonical に集約。
        const merged = capPresetsByRecent([...prev, next]) as ThemePreset[];
        persistPresets(merged);
        return merged;
      });
    },
    [],
  );

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === prev.length) return prev;
      persistPresets(next);
      return next;
    });
  }, []);

  return { presets, savePreset, deletePreset };
}
