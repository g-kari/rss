"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Layout, FontSize } from "../types";
import { STORAGE_KEYS, storageGet, storageSet, loadSet, toggleSetItem } from "../lib/storage";

/** NSFW 活性化に必要な連打回数 */
const NSFW_CLICK_COUNT = 5;
/** 連打として認識する時間ウィンドウ (ms) */
const NSFW_CLICK_WINDOW = 2000;

export type Theme = "light" | "dark";
export type MobilePane = "sidebar" | "list" | "view";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function loadStoredEnum<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  const stored = storageGet(key);
  return valid.includes(stored as T) ? (stored as T) : fallback;
}

const LAYOUTS = ["compact", "list", "card", "magazine"] as const;
const FONT_SIZES = ["small", "medium", "large"] as const;

const loadLayout = () => loadStoredEnum(STORAGE_KEYS.LAYOUT, LAYOUTS, "list" as Layout);
const loadFontSize = () => loadStoredEnum(STORAGE_KEYS.FONT_SIZE, FONT_SIZES, "medium" as FontSize);

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
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [pinnedFeedIds, setPinnedFeedIds] = useState<Set<string>>(loadPinnedFeedIds);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>(initialMobilePane);
  const prevMobilePaneRef = useRef<MobilePane>(initialMobilePane);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [nsfwMode, setNsfwMode] = useState(() => storageGet(STORAGE_KEYS.NSFW_MODE) === "1");
  const [showNSFWAnimation, setShowNSFWAnimation] = useState(false);
  const nsfwClickTimesRef = useRef<number[]>([]);

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

  // モバイルペイン前進時に history エントリを積む
  useEffect(() => {
    const prev = prevMobilePaneRef.current;
    if (
      (prev === "sidebar" && mobilePane === "list") ||
      (prev === "list" && mobilePane === "view")
    ) {
      window.history.pushState({ mobilePane }, "");
    }
    prevMobilePaneRef.current = mobilePane;
  }, [mobilePane]);

  // popstate（戻るボタン）でアプリ内ペイン遷移を処理
  useEffect(() => {
    function onPopState() {
      setMobilePane((current) => {
        if (current === "view") return "list";
        if (current === "list") return "sidebar";
        return current;
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  const activateNSFW = useCallback(() => {
    const now = Date.now();
    const times = nsfwClickTimesRef.current;
    times.push(now);
    if (times.length > NSFW_CLICK_COUNT) times.shift();
    if (times.length === NSFW_CLICK_COUNT && now - times[0] < NSFW_CLICK_WINDOW) {
      nsfwClickTimesRef.current = [];
      if (!nsfwMode) {
        setShowNSFWAnimation(true);
      }
    }
  }, [nsfwMode]);

  const deactivateNSFW = useCallback(() => {
    setNsfwMode(false);
    storageSet(STORAGE_KEYS.NSFW_MODE, "0");
  }, []);

  const onNSFWAnimationComplete = useCallback(() => {
    setShowNSFWAnimation(false);
    setNsfwMode(true);
    storageSet(STORAGE_KEYS.NSFW_MODE, "1");
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
