"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

export type { MobilePane } from "./useMobilePane";
import type { MobilePane } from "./useMobilePane";
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
  toast: string | null;
  showToast: (msg: string) => void;
  mobilePane: MobilePane;
  setMobilePane: React.Dispatch<React.SetStateAction<MobilePane>>;
  install: { canInstall: boolean; onInstall: () => Promise<void> };
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  nsfwMode: boolean;
  showNSFWAnimation: boolean;
  activateNSFW: () => void;
  deactivateNSFW: () => void;
  onNSFWAnimationComplete: () => void;
}

export function useUIState(initialMobilePane: MobilePane): UIState {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [fontSize, setFontSize] = useState<FontSize>(loadFontSize);
  const [fontFamily, setFontFamily] = useState<FontFamily>(loadFontFamily);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [pinnedFeedIds, setPinnedFeedIds] = useState<Set<string>>(loadPinnedFeedIds);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);

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
  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // ? キーでヘルプトグル
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?") setShowHelp((v) => !v);
      if (e.key === "Escape") setShowHelp(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const onChangeFontSize = useCallback((size: FontSize) => {
    setFontSize(size);
    storageSet(STORAGE_KEYS.FONT_SIZE, size);
  }, []);

  const onChangeFontFamily = useCallback((family: FontFamily) => {
    setFontFamily(family);
    storageSet(STORAGE_KEYS.FONT_FAMILY, family);
  }, []);

  const onChangeLayout = useCallback((l: Layout) => {
    setLayout(l);
    storageSet(STORAGE_KEYS.LAYOUT, l);
  }, []);

  const togglePinFeed = useCallback((feedId: string) => {
    toggleSetItem(setPinnedFeedIds, STORAGE_KEYS.PINNED_FEED_IDS, feedId);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
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
    toast,
    showToast,
    mobilePane,
    setMobilePane,
    install: { canInstall: !!installPrompt, onInstall: installApp },
    showHelp,
    setShowHelp,
    nsfwMode,
    showNSFWAnimation,
    activateNSFW,
    deactivateNSFW,
    onNSFWAnimationComplete,
  };
}
