"use client";

import { useState, useEffect, useCallback } from "react";
import { useEventListener } from "./useEventListener";
import { useAutoReset } from "./useAutoReset";
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
import {
  CONTENT_WIDTH_CYCLE,
  LINE_HEIGHT_CYCLE,
  type ContentWidth,
  type LineHeight,
} from "../lib/reader-settings";
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

/** 自動既読の閾値（%）— 70 / 80 / 90 をサイクル */
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

const loadLineHeight = () =>
  loadStoredEnum(STORAGE_KEYS.LINE_HEIGHT, LINE_HEIGHT_CYCLE, "normal" as LineHeight);
const loadContentWidth = () =>
  loadStoredEnum(STORAGE_KEYS.CONTENT_WIDTH, CONTENT_WIDTH_CYCLE, "medium" as ContentWidth);
function loadTextJustify(): boolean {
  return storageGet(STORAGE_KEYS.TEXT_JUSTIFY) === "true";
}

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
  autoReadEnabled: boolean;
  toggleAutoRead: () => void;
  autoReadThreshold: AutoReadThreshold;
  cycleAutoReadThreshold: () => void;
  onChangeAutoReadThreshold: (v: AutoReadThreshold) => void;
  lineHeight: LineHeight;
  onChangeLineHeight: (lh: LineHeight) => void;
  contentWidth: ContentWidth;
  onChangeContentWidth: (w: ContentWidth) => void;
  textJustify: boolean;
  onChangeTextJustify: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
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
  const [toast, setToast] = useAutoReset<string | null>(null, 2000);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [autoReadEnabled, setAutoReadEnabled] = useState<boolean>(loadAutoReadEnabled);
  const [autoReadThreshold, setAutoReadThreshold] =
    useState<AutoReadThreshold>(loadAutoReadThreshold);
  const [lineHeight, onChangeLineHeight] = useStoredSetting<LineHeight>(
    loadLineHeight,
    STORAGE_KEYS.LINE_HEIGHT,
  );
  const [contentWidth, onChangeContentWidth] = useStoredSetting<ContentWidth>(
    loadContentWidth,
    STORAGE_KEYS.CONTENT_WIDTH,
  );
  const [textJustify, setTextJustifyState] = useState<boolean>(loadTextJustify);
  const onChangeTextJustify = useCallback((v: boolean) => {
    setTextJustifyState(v);
    storageSet(STORAGE_KEYS.TEXT_JUSTIFY, String(v));
  }, []);
  const [showSettings, setShowSettings] = useState(false);

  const { mobilePane, setMobilePane } = useMobilePane(initialMobilePane);
  const { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete } =
    useNSFWMode();

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

  const showToast = useCallback(
    (msg: string) => {
      setToast(msg);
    },
    [setToast],
  );

  const toggleFocusMode = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  const toggleAutoRead = useCallback(() => {
    setAutoReadEnabled((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.AUTO_READ_ENABLED, next ? "1" : "0");
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
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    lineHeight,
    onChangeLineHeight,
    contentWidth,
    onChangeContentWidth,
    textJustify,
    onChangeTextJustify,
    showSettings,
    setShowSettings,
  };
}
