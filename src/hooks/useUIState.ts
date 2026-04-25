"use client";

import { useState, useCallback } from "react";
import { useEventListener } from "./useEventListener";
import { useAutoReset } from "./useAutoReset";
import { STORAGE_KEYS, loadSet, toggleSetItem } from "../lib/storage";
import type { FontFamily, Layout, FontSize, FeedView } from "../types";
import type { ContentWidth, LineHeight, GalleryColumns } from "../lib/reader-settings";
import { useMobilePane } from "./useMobilePane";
import { useNSFWMode } from "./useNSFWMode";
import { useThemePreference } from "./useThemePreference";
import { useLayoutSettings } from "./useLayoutSettings";
import { useAutoReadSettings } from "./useAutoReadSettings";
import { useAccessibilitySettings } from "./useAccessibilitySettings";

import type { MobilePane } from "./useMobilePane";
// UIState interface で使うためのローカル import（re-export だけではローカルスコープに入らない）
import type { Theme } from "./useThemePreference";
import type { AutoReadThreshold } from "./useAutoReadSettings";
export type { MobilePane };
export type { Theme } from "./useThemePreference";
export type { AutoReadThreshold } from "./useAutoReadSettings";
export { AUTO_READ_THRESHOLD_CYCLE } from "./useAutoReadSettings";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const loadPinnedFeedIds = () => loadSet(STORAGE_KEYS.PINNED_FEED_IDS);
const loadCollapsedCategories = () => loadSet(STORAGE_KEYS.COLLAPSED_CATEGORIES);

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
  /** 記事一覧フォーカスモード — サイドバーと記事ビューを折り畳み記事一覧を最大化する */
  listFocusMode: boolean;
  toggleListFocusMode: () => void;
  setListFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  /** 両フォーカスモードを同時に OFF にする（終了ボタン用） */
  exitFocusMode: () => void;
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
  autoTranslate: boolean;
  toggleAutoTranslate: () => void;
  lineHeight: LineHeight;
  onChangeLineHeight: (lh: LineHeight) => void;
  contentWidth: ContentWidth;
  onChangeContentWidth: (w: ContentWidth) => void;
  textJustify: boolean;
  onChangeTextJustify: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  activeFeedView: FeedView;
  onChangeActiveFeedView: (v: FeedView) => void;
  galleryColumns: GalleryColumns;
  onChangeGalleryColumns: (v: GalleryColumns) => void;
}

export function useUIState(initialMobilePane: MobilePane): UIState {
  const { theme, toggleTheme } = useThemePreference();
  const {
    layout,
    onChangeLayout,
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    activeFeedView,
    onChangeActiveFeedView,
    galleryColumns,
    onChangeGalleryColumns,
    contentWidth,
    onChangeContentWidth,
  } = useLayoutSettings();
  const {
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
  } = useAutoReadSettings();
  const { lineHeight, onChangeLineHeight, textJustify, onChangeTextJustify } =
    useAccessibilitySettings();

  const [pinnedFeedIds, setPinnedFeedIds] = useState<Set<string>>(loadPinnedFeedIds);
  const [collapsedCategories, setCollapsedCategories] =
    useState<Set<string>>(loadCollapsedCategories);
  const [toast, setToast] = useAutoReset<string | null>(null, 2000);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [listFocusMode, setListFocusMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { mobilePane, setMobilePane } = useMobilePane(initialMobilePane);
  const { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete } =
    useNSFWMode();

  useEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    },
    window,
  );

  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?") setShowHelp((v) => !v);
      if (e.key === "\\") {
        if (e.shiftKey) {
          setListFocusMode((v) => !v);
          setFocusMode(false);
        } else {
          setFocusMode((v) => !v);
          setListFocusMode(false);
        }
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowFeedSwitcher(false);
        setFocusMode(false);
        setListFocusMode(false);
      }
    },
    document,
  );

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
    setListFocusMode(false);
  }, []);

  const toggleListFocusMode = useCallback(() => {
    setListFocusMode((v) => !v);
    setFocusMode(false);
  }, []);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    setListFocusMode(false);
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
    listFocusMode,
    toggleListFocusMode,
    setListFocusMode,
    exitFocusMode,
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
    autoTranslate,
    toggleAutoTranslate,
    lineHeight,
    onChangeLineHeight,
    contentWidth,
    onChangeContentWidth,
    textJustify,
    onChangeTextJustify,
    showSettings,
    setShowSettings,
    activeFeedView,
    onChangeActiveFeedView,
    galleryColumns,
    onChangeGalleryColumns,
  };
}
