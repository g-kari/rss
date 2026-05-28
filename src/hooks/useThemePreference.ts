"use client";

import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

export type Theme = "light" | "dark";

function loadTheme(): Theme {
  const stored = storageGet(STORAGE_KEYS.THEME);
  if (stored === "light" || stored === "dark") return stored;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * テーマ設定 (light / dark) を localStorage に永続化しつつ `<html data-theme>` 属性に同期する hook。
 * @returns `{ theme, toggleTheme, setTheme }` 現在のテーマ + toggle / 明示 setter
 *   (`setTheme` は theme preset 適用などで具体的な値をセットしたい場合に使う、`toggleTheme` は反転)
 */
export function useThemePreference() {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storageSet(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  return { theme, toggleTheme, setTheme } as const;
}
