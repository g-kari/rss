"use client";

import { useState, useCallback, useRef } from "react";
import { useEventListener } from "./useEventListener";

import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, loadSet, toggleSetItem } from "../lib/storage";
import type { FontFamily, Layout, FontSize, FeedView } from "../types";
import type {
  ContentWidth,
  LineHeight,
  GalleryColumns,
  GalleryCardSize,
} from "../lib/reader-settings";
import { useMobilePane } from "./useMobilePane";
import { useNSFWMode } from "./useNSFWMode";
import { useThemePreference } from "./useThemePreference";
import { useLayoutSettings } from "./useLayoutSettings";
import { useAutoReadSettings } from "./useAutoReadSettings";
import { useAccessibilitySettings } from "./useAccessibilitySettings";

import type { MobilePane } from "./useMobilePane";
// UIState interface で使うためのローカル import（re-export だけではローカルスコープに入らない）
import type { Theme } from "./useThemePreference";
import type { AutoReadThreshold, WorkersAiModelId } from "./useAutoReadSettings";
export type { MobilePane };
export type { Theme } from "./useThemePreference";
export type { AutoReadThreshold, WorkersAiModelId } from "./useAutoReadSettings";
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
  deduplicateByLink: boolean;
  toggleDeduplicateByLink: () => void;
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
  galleryCardSize: GalleryCardSize;
  onChangeGalleryCardSize: (v: GalleryCardSize) => void;
  galleryMinImagePx: number;
  onChangeGalleryMinImagePx: (v: number) => void;
  imageDlFolder: string;
  onChangeImageDlFolder: (v: string) => void;
  imageDlFolderNsfw: string;
  onChangeImageDlFolderNsfw: (v: string) => void;
  aiModel: WorkersAiModelId;
  onChangeAiModel: (v: WorkersAiModelId) => void;
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
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
    contentWidth,
    onChangeContentWidth,
    imageDlFolder,
    onChangeImageDlFolder,
    imageDlFolderNsfw,
    onChangeImageDlFolderNsfw,
  } = useLayoutSettings();
  const {
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
    deduplicateByLink,
    toggleDeduplicateByLink,
    aiModel,
    onChangeAiModel,
  } = useAutoReadSettings();
  const { lineHeight, onChangeLineHeight, textJustify, onChangeTextJustify } =
    useAccessibilitySettings();

  const [pinnedFeedIds, setPinnedFeedIds] = useState<Set<string>>(loadPinnedFeedIds);
  const [collapsedCategories, setCollapsedCategories] =
    useState<Set<string>>(loadCollapsedCategories);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [listFocusMode, setListFocusMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { mobilePane, setMobilePane } = useMobilePane(initialMobilePane);
  const { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete } =
    useNSFWMode();

  const focusModeRef = useSyncedRef(focusMode);
  const listFocusModeRef = useSyncedRef(listFocusMode);
  const focusHistoryRef = useRef(false);

  const pushFocusHistory = useCallback(() => {
    if (!focusHistoryRef.current) {
      focusHistoryRef.current = true;
      window.history.pushState({ focus: true }, "");
    }
  }, []);

  const exitFocusViaHistory = useCallback(() => {
    if (focusHistoryRef.current) {
      focusHistoryRef.current = false;
      window.history.back();
    } else {
      setFocusMode(false);
      setListFocusMode(false);
    }
  }, []);

  useEventListener("popstate", () => {
    if (!focusHistoryRef.current) return;
    if (window.history.state?.focus) return;
    focusHistoryRef.current = false;
    setFocusMode(false);
    setListFocusMode(false);
  });

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
          if (listFocusModeRef.current) {
            exitFocusViaHistory();
          } else {
            pushFocusHistory();
            setListFocusMode(true);
            setFocusMode(false);
          }
        } else {
          if (focusModeRef.current) {
            exitFocusViaHistory();
          } else {
            pushFocusHistory();
            setFocusMode(true);
            setListFocusMode(false);
          }
        }
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowFeedSwitcher(false);
        exitFocusViaHistory();
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

  const toggleFocusMode = useCallback(() => {
    if (focusModeRef.current) {
      exitFocusViaHistory();
    } else {
      pushFocusHistory();
      setFocusMode(true);
      setListFocusMode(false);
    }
  }, [focusModeRef, exitFocusViaHistory, pushFocusHistory]);

  const toggleListFocusMode = useCallback(() => {
    if (listFocusModeRef.current) {
      exitFocusViaHistory();
    } else {
      pushFocusHistory();
      setListFocusMode(true);
      setFocusMode(false);
    }
  }, [listFocusModeRef, exitFocusViaHistory, pushFocusHistory]);

  const exitFocusMode = useCallback(() => {
    exitFocusViaHistory();
  }, [exitFocusViaHistory]);

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
    deduplicateByLink,
    toggleDeduplicateByLink,
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
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
    imageDlFolder,
    onChangeImageDlFolder,
    imageDlFolderNsfw,
    onChangeImageDlFolderNsfw,
    aiModel,
    onChangeAiModel,
  };
}
