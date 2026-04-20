"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FontFamily, FontSize } from "../types";
import type { Theme, AutoReadThreshold } from "../hooks/useUIState";
import type { LineHeight, ContentWidth, GalleryColumns } from "../lib/reader-settings";

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
  lineHeight: LineHeight;
  onChangeLineHeight: (lh: LineHeight) => void;
  contentWidth: ContentWidth;
  onChangeContentWidth: (w: ContentWidth) => void;
  textJustify: boolean;
  onChangeTextJustify: (v: boolean) => void;
  galleryColumns: GalleryColumns;
  onChangeGalleryColumns: (v: GalleryColumns) => void;
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
