"use client";

import type { FontFamily, Layout, FontSize, FeedView } from "../types";
import { STORAGE_KEYS, loadStoredEnum } from "../lib/storage";
import { FONT_FAMILY_CYCLE, FONT_SIZE_CYCLE, LAYOUT_CYCLE } from "../lib/article-utils";
import {
  CONTENT_WIDTH_CYCLE,
  GALLERY_COLUMNS_CYCLE,
  GALLERY_CARD_SIZE_CYCLE,
  GALLERY_MIN_IMAGE_PX_DEFAULT,
  GALLERY_MIN_IMAGE_PX_MAX,
  GALLERY_MIN_IMAGE_PX_MIN,
  type ContentWidth,
  type GalleryColumns,
  type GalleryCardSize,
} from "../lib/reader-settings";
import { useStoredSetting } from "./useStoredSetting";
import { useState, useCallback } from "react";
import { storageGet, storageSet } from "../lib/storage";

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
const loadGalleryCardSize = () =>
  loadStoredEnum(
    STORAGE_KEYS.GALLERY_CARD_SIZE,
    GALLERY_CARD_SIZE_CYCLE,
    "medium" as GalleryCardSize,
  );
const loadGalleryMinImagePx = (): number => {
  const raw = storageGet(STORAGE_KEYS.GALLERY_MIN_IMAGE_FILTER);
  if (raw === null) return GALLERY_MIN_IMAGE_PX_DEFAULT;
  const n = Number(raw);
  if (isNaN(n)) return GALLERY_MIN_IMAGE_PX_DEFAULT;
  return Math.max(GALLERY_MIN_IMAGE_PX_MIN, Math.min(GALLERY_MIN_IMAGE_PX_MAX, n));
};
const loadContentWidth = () =>
  loadStoredEnum(STORAGE_KEYS.CONTENT_WIDTH, CONTENT_WIDTH_CYCLE, "medium" as ContentWidth);
const loadImageDlFolder = (): string => storageGet(STORAGE_KEYS.IMAGE_DL_FOLDER) ?? "";
const loadImageDlFolderNsfw = (): string => storageGet(STORAGE_KEYS.IMAGE_DL_FOLDER_NSFW) ?? "";

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
  const [galleryCardSize, onChangeGalleryCardSize] = useStoredSetting<GalleryCardSize>(
    loadGalleryCardSize,
    STORAGE_KEYS.GALLERY_CARD_SIZE,
  );
  const [galleryMinImagePx, setGalleryMinImagePx] = useState(loadGalleryMinImagePx);
  const onChangeGalleryMinImagePx = useCallback((v: number) => {
    const clamped = Math.max(GALLERY_MIN_IMAGE_PX_MIN, Math.min(GALLERY_MIN_IMAGE_PX_MAX, v));
    setGalleryMinImagePx(clamped);
    storageSet(STORAGE_KEYS.GALLERY_MIN_IMAGE_FILTER, String(clamped));
  }, []);
  const [contentWidth, onChangeContentWidth] = useStoredSetting<ContentWidth>(
    loadContentWidth,
    STORAGE_KEYS.CONTENT_WIDTH,
  );
  const [imageDlFolder, setImageDlFolder] = useState(loadImageDlFolder);
  const onChangeImageDlFolder = useCallback((v: string) => {
    setImageDlFolder(v);
    storageSet(STORAGE_KEYS.IMAGE_DL_FOLDER, v);
  }, []);
  const [imageDlFolderNsfw, setImageDlFolderNsfw] = useState(loadImageDlFolderNsfw);
  const onChangeImageDlFolderNsfw = useCallback((v: string) => {
    setImageDlFolderNsfw(v);
    storageSet(STORAGE_KEYS.IMAGE_DL_FOLDER_NSFW, v);
  }, []);

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
  } as const;
}
