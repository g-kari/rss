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
 * @returns `{ theme, toggleTheme, setTheme }` 現在のテーマ + 切替 callback
 */
export function useThemePreference() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storageSet(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  return { theme, toggleTheme } as const;
}
