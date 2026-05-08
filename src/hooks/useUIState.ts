"use client";

import { useState } from "react";
import { useEventListener } from "./useEventListener";

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
import { usePinnedAndCategories } from "./usePinnedAndCategories";
import { useFocusMode } from "./useFocusMode";
import { usePWAInstall } from "./usePWAInstall";

import type { MobilePane } from "./useMobilePane";
// UIState interface で使うためのローカル import（re-export だけではローカルスコープに入らない）
import type { Theme } from "./useThemePreference";
import type { AutoReadThreshold, WorkersAiModelId } from "./useAutoReadSettings";
export type { MobilePane };
export type { Theme } from "./useThemePreference";
export type { AutoReadThreshold, WorkersAiModelId } from "./useAutoReadSettings";
export { AUTO_READ_THRESHOLD_CYCLE } from "./useAutoReadSettings";

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

/**
 * UI 状態を集約する薄い合成層。
 * 個別の関心事は専用サブフックに切り出し済み（useFocusMode / usePWAInstall / usePinnedAndCategories 等）。
 * Phase 2（別 Issue）で本フックは廃止し、App.tsx で各サブフックを直接呼び出す予定。
 */
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
  const { mobilePane, setMobilePane } = useMobilePane(initialMobilePane);
  const { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete } =
    useNSFWMode();
  const { pinnedFeedIds, togglePinFeed, collapsedCategories, toggleCollapseCategory } =
    usePinnedAndCategories();
  const {
    focusMode,
    listFocusMode,
    toggleFocusMode,
    toggleListFocusMode,
    setListFocusMode,
    exitFocusMode,
  } = useFocusMode();
  const install = usePWAInstall();

  const [showHelp, setShowHelp] = useState(false);
  const [showFeedSwitcher, setShowFeedSwitcher] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // モーダル系のグローバルキー: ? でヘルプトグル、Escape で閉じる
  // フォーカスモードの Escape は useFocusMode 側で別途処理される
  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?") setShowHelp((v) => !v);
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowFeedSwitcher(false);
      }
    },
    document,
  );

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
    install,
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
