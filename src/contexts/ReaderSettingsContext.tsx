"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FontFamily, FontSize } from "../types";
import type { Theme } from "../hooks/useThemePreference";
import type { AutoReadThreshold, WorkersAiModelId } from "../hooks/useAutoReadSettings";
import type {
  LineHeight,
  ContentWidth,
  GalleryColumns,
  GalleryCardSize,
} from "../lib/reader-settings";

export interface ReaderSettings {
  fontSize: FontSize;
  onChangeFontSize: (size: FontSize) => void;
  fontFamily: FontFamily;
  onChangeFontFamily: (family: FontFamily) => void;
  theme: Theme;
  focusMode: boolean;
  toggleFocusMode: () => void;
  autoReadEnabled: boolean;
  toggleAutoRead: () => void;
  autoReadThreshold: AutoReadThreshold;
  cycleAutoReadThreshold: () => void;
  onChangeAutoReadThreshold: (v: AutoReadThreshold) => void;
  autoTranslate: boolean;
  toggleAutoTranslate: () => void;
  autoSummarize: boolean;
  toggleAutoSummarize: () => void;
  /**
   * #700: ON のときブラウザネイティブ AI が利用不可な記事では auto-translate / auto-summarize
   * を skip し、Workers AI へのフォールバックを発動させない。
   */
  autoAiBrowserOnly: boolean;
  toggleAutoAiBrowserOnly: () => void;
  lineHeight: LineHeight;
  onChangeLineHeight: (lh: LineHeight) => void;
  contentWidth: ContentWidth;
  onChangeContentWidth: (w: ContentWidth) => void;
  textJustify: boolean;
  onChangeTextJustify: (v: boolean) => void;
  galleryColumns: GalleryColumns;
  onChangeGalleryColumns: (v: GalleryColumns) => void;
  /**
   * フォーカスモード時のギャラリー列数 (#666)。
   * `"auto"` は「通常列数に追従」を意味する（既存ユーザー後方互換）。
   */
  galleryColumnsFocus: GalleryColumns;
  onChangeGalleryColumnsFocus: (v: GalleryColumns) => void;
  galleryCardSize: GalleryCardSize;
  onChangeGalleryCardSize: (v: GalleryCardSize) => void;
  galleryMinImagePx: number;
  onChangeGalleryMinImagePx: (v: number) => void;
  deduplicateByLink: boolean;
  toggleDeduplicateByLink: () => void;
  ttlDays: number | null;
  onChangeTtlDays: (days: number | null) => void;
  imageDlFolder: string;
  onChangeImageDlFolder: (v: string) => void;
  imageDlFolderNsfw: string;
  onChangeImageDlFolderNsfw: (v: string) => void;
  aiModel: WorkersAiModelId;
  onChangeAiModel: (v: WorkersAiModelId) => void;
}

const ReaderSettingsContext = createContext<ReaderSettings | null>(null);

interface ProviderProps {
  value: ReaderSettings;
  children: ReactNode;
}

export function ReaderSettingsProvider({ value, children }: ProviderProps) {
  return <ReaderSettingsContext.Provider value={value}>{children}</ReaderSettingsContext.Provider>;
}

export function useReaderSettings(): ReaderSettings {
  const ctx = useContext(ReaderSettingsContext);
  if (!ctx) {
    throw new Error("useReaderSettings must be used within a ReaderSettingsProvider");
  }
  return ctx;
}
