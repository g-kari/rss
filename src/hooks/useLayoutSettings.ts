"use client";

import type { FontFamily, Layout, FontSize, FeedView } from "../types";
import { STORAGE_KEYS, loadStoredEnum } from "../lib/storage";
import { FONT_FAMILY_CYCLE, FONT_SIZE_CYCLE, LAYOUT_CYCLE } from "../lib/article-utils";
import {
  CONTENT_WIDTH_CYCLE,
  GALLERY_COLUMNS_CYCLE,
  type ContentWidth,
  type GalleryColumns,
} from "../lib/reader-settings";
import { useStoredSetting } from "./useStoredSetting";

const loadLayout = () => loadStoredEnum(STORAGE_KEYS.LAYOUT, LAYOUT_CYCLE, "list" as Layout);
const FEED_VIEW_CYCLE: readonly FeedView[] = ["articles", "pictures", "videos", "social"] as const;
const loadActiveFeedView = () =>
  loadStoredEnum(STORAGE_KEYS.ACTIVE_FEED_VIEW, FEED_VIEW_CYCLE, "articles" as FeedView);
const loadFontSize = () =>
  loadStoredEnum(STORAGE_KEYS.FONT_SIZE, FONT_SIZE_CYCLE, "medium" as FontSize);
const loadFontFamily = () =>
  loadStoredEnum(STORAGE_KEYS.FONT_FAMILY, FONT_FAMILY_CYCLE, "sans" as FontFamily);
const loadGalleryColumns = () =>
  loadStoredEnum(STORAGE_KEYS.GALLERY_COLUMNS, GALLERY_COLUMNS_CYCLE, "auto" as GalleryColumns);
const loadContentWidth = () =>
  loadStoredEnum(STORAGE_KEYS.CONTENT_WIDTH, CONTENT_WIDTH_CYCLE, "medium" as ContentWidth);

export function useLayoutSettings() {
  const [layout, onChangeLayout] = useStoredSetting<Layout>(loadLayout, STORAGE_KEYS.LAYOUT);
  const [fontSize, onChangeFontSize] = useStoredSetting<FontSize>(
    loadFontSize,
    STORAGE_KEYS.FONT_SIZE,
  );
  const [fontFamily, onChangeFontFamily] = useStoredSetting<FontFamily>(
    loadFontFamily,
    STORAGE_KEYS.FONT_FAMILY,
  );
  const [activeFeedView, onChangeActiveFeedView] = useStoredSetting<FeedView>(
    loadActiveFeedView,
    STORAGE_KEYS.ACTIVE_FEED_VIEW,
  );
  const [galleryColumns, onChangeGalleryColumns] = useStoredSetting<GalleryColumns>(
    loadGalleryColumns,
    STORAGE_KEYS.GALLERY_COLUMNS,
  );
  const [contentWidth, onChangeContentWidth] = useStoredSetting<ContentWidth>(
    loadContentWidth,
    STORAGE_KEYS.CONTENT_WIDTH,
  );

  return {
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
  } as const;
}
