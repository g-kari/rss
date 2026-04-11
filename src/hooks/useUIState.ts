"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEventListener } from "./useEventListener";
import type { FontFamily, Layout, FontSize } from "../types";
import {
  STORAGE_KEYS,
  storageGet,
  storageSet,
  loadSet,
  loadStoredEnum,
  toggleSetItem,
} from "../lib/storage";
import { FONT_FAMILY_CYCLE, FONT_SIZE_CYCLE, LAYOUT_CYCLE } from "../lib/article-utils";
import { useMobilePane } from "./useMobilePane";
import { useNSFWMode } from "./useNSFWMode";

import type { MobilePane } from "./useMobilePane";
export type { MobilePane };
export type Theme = "light" | "dark";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const loadLayout = () => loadStoredEnum(STORAGE_KEYS.LAYOUT, LAYOUT_CYCLE, "list" as Layout);
const loadFontSize = () =>
  loadStoredEnum(STORAGE_KEYS.FONT_SIZE, FONT_SIZE_CYCLE, "medium" as FontSize);
const loadFontFamily = () =>
  loadStoredEnum(STORAGE_KEYS.FONT_FAMILY, FONT_FAMILY_CYCLE, "sans" as FontFamily);

function loadTheme(): Theme {
  const stored = storageGet(STORAGE_KEYS.THEME);
  if (stored === "light" || stored === "dark") return stored;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const loadPinnedFeedIds = () => loadSet(STORAGE_KEYS.PINNED_FEED_IDS);
const loadCollapsedCategories = () => loadSet(STORAGE_KEYS.COLLAPSED_CATEGORIES);

/** localStorage に永続化する enum 系設定の state と onChange セッターをまとめて返す。 */
function useStoredSetting<T extends string>(load: () => T, key: string): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(load);
  const onChange = useCallback(
    (v: T) => {
      setValue(v);
      storageSet(key, v);
    },
    [key],
  );
  return [value, onChange];
}

export interface UIState {
  theme: Theme;
  toggleTheme: () => void;
  fontSize: FontSize;
  onChangeFontSize: (size: FontSize) => void;
  fontFamily: FontFamily;
  onChangeFontFamily: (family: FontFamily) => void;
  layout: Layout;
  onChangeLayout: (l: Layout) => void;
  pinnedFeedIds: Set<string>;
  togglePinFeed: (feedId: string) => void;
  collapsedCategories: Set<string>;
  toggleCollapseCategory: (category: string) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  mobilePane: MobilePane;
  setMobilePane: React.Dispatch<React.SetStateAction<MobilePane>>;
  install: { canInstall: boolean; onInstall: () => Promise<void> };
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showFeedSwitcher: boolean;
  setShowFeedSwitcher: React.Dispatch<React.SetStateAction<boolean>>;
  focusMode: boolean;
  toggleFocusMode: () => void;
  nsfwMode: boolean;
  showNSFWAnimation: boolean;
  activateNSFW: () => void;
  deactivateNSFW: () => void;
  onNSFWAnimationComplete: () => void;
}

/**
 * グローバル UI 状態管理フック。
 *
 * テーマ（light/dark）・レイアウト・フォント設定は `localStorage` に永続化する。
 * テーマ初期値は `prefers-color-scheme` を参照し、`document.documentElement.dataset.theme` を切り替える。
 * モーダル表示状態・PWA インストールプロンプト (`BeforeInstallPromptEvent`) も管理する。
 */
export function useUIState(initialMobilePane: MobilePane): UIState {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [fontSize, onChangeFontSize] = useStoredSetting<FontSize>(
    loadFontSize,
    STORAGE_KEYS.FONT_SIZE,
  );
  const [fontFamily, onChangeFontFamily] = useStoredSetting<FontFamily>(
    loadFontFamily,
    STORAGE_KEYS.FONT_FAMILY,
  );
  const [layout, onChangeLayout] = useStoredSetting<Layout>(loadLayout, STORAGE_KEYS.LAYOUT);
  const [pinnedFeedIds, setPinnedFeedIds] = useState<Set<string>>(loadPinnedFeedIds);
  const [collapsedCategories, setCollapsedCategories] =
    useState<Set<string>>(loadCollapsedCategories);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const { mobilePane, setMobilePane } = useMobilePane(initialMobilePane);
  const { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete } =
    useNSFWMode();

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // テーマを DOM に同期
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storageSet(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  // PWA インストールプロンプトを捕捉（Chrome / Android）
  // beforeinstallprompt は非標準イベントのため string オーバーロードを使用
  useEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    },
    window,
  );

  // ? キーでヘルプトグル / \ キーでフォーカスモードトグル
  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?") setShowHelp((v) => !v);
      if (e.key === "\\") setFocusMode((v) => !v);
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowFeedSwitcher(false);
        setFocusMode(false);
      }
    },
    document,
  );

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const togglePinFeed = useCallback((feedId: string) => {
    toggleSetItem(setPinnedFeedIds, STORAGE_KEYS.PINNED_FEED_IDS, feedId);
  }, []);

  const toggleCollapseCategory = useCallback((category: string) => {
    toggleSetItem(setCollapsedCategories, STORAGE_KEYS.COLLAPSED_CATEGORIES, category);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  return {
    theme,
    toggleTheme,
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    layout,
    onChangeLayout,
    pinnedFeedIds,
    togglePinFeed,
    collapsedCategories,
    toggleCollapseCategory,
    toast,
    showToast,
    mobilePane,
    setMobilePane,
    install: { canInstall: !!installPrompt, onInstall: installApp },
    showHelp,
    setShowHelp,
    showFeedSwitcher,
    setShowFeedSwitcher,
    focusMode,
    toggleFocusMode,
    nsfwMode,
    showNSFWAnimation,
    activateNSFW,
    deactivateNSFW,
    onNSFWAnimationComplete,
  };
}
