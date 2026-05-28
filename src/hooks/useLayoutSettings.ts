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
  parseGalleryPageSize,
  type ContentWidth,
  type GalleryColumns,
  type GalleryCardSize,
  type GalleryPageSize,
} from "../lib/reader-settings";
import { useStoredSetting } from "./useStoredSetting";
import { useState, useCallback } from "react";
import { storageGet, storageSet } from "../lib/storage";
import {
  GALLERY_AUTO_SCROLL_SPEEDS,
  parseGalleryAutoScrollSpeed,
  type GalleryAutoScrollSpeed,
} from "../lib/gallery-autoscroll";

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
// #690: ギャラリー自動スクロール速度 (off / slow / medium / fast / slideshow)
// 専用 parser を使う理由: loadStoredEnum と異なり「不正値 → off フォールバック」を
// 純粋関数化済み (gallery-autoscroll.spec.ts でテスト網羅)。
const loadGalleryAutoScrollSpeed = (): GalleryAutoScrollSpeed =>
  parseGalleryAutoScrollSpeed(storageGet(STORAGE_KEYS.GALLERY_AUTO_SCROLL_SPEED));
const loadGalleryPageSize = (): GalleryPageSize =>
  parseGalleryPageSize(storageGet(STORAGE_KEYS.GALLERY_PAGE_SIZE));
const loadGalleryColumnsFocus = () =>
  loadStoredEnum(
    STORAGE_KEYS.GALLERY_COLUMNS_FOCUS,
    GALLERY_COLUMNS_CYCLE,
    "auto" as GalleryColumns,
  );
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

/**
 * 表示レイアウト設定 (layout / fontSize / カラム数 / 等) を localStorage に永続化しつつ管理する hook。
 * @returns 各設定値 + setter callback (`{ layout, onChangeLayout, fontSize, onChangeFontSize, ... }`)
 */
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
  const [galleryColumnsFocus, onChangeGalleryColumnsFocus] = useStoredSetting<GalleryColumns>(
    loadGalleryColumnsFocus,
    STORAGE_KEYS.GALLERY_COLUMNS_FOCUS,
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
  const [imageDlFolder, onChangeImageDlFolder] = useStoredSetting<string>(
    loadImageDlFolder,
    STORAGE_KEYS.IMAGE_DL_FOLDER,
  );
  const [imageDlFolderNsfw, onChangeImageDlFolderNsfw] = useStoredSetting<string>(
    loadImageDlFolderNsfw,
    STORAGE_KEYS.IMAGE_DL_FOLDER_NSFW,
  );
  const [galleryAutoScrollSpeed, onChangeGalleryAutoScrollSpeed] =
    useStoredSetting<GalleryAutoScrollSpeed>(
      loadGalleryAutoScrollSpeed,
      STORAGE_KEYS.GALLERY_AUTO_SCROLL_SPEED,
    );
  // GalleryPageSize は number union のため `useStoredSetting<T extends string>` は使えず、
  // 個別に useState + useCallback + storageSet で永続化する。
  const [galleryPageSize, setGalleryPageSize] = useState<GalleryPageSize>(loadGalleryPageSize);
  const onChangeGalleryPageSize = useCallback((v: GalleryPageSize) => {
    setGalleryPageSize(v);
    storageSet(STORAGE_KEYS.GALLERY_PAGE_SIZE, String(v));
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
    galleryColumnsFocus,
    onChangeGalleryColumnsFocus,
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
    galleryAutoScrollSpeed,
    onChangeGalleryAutoScrollSpeed,
    galleryPageSize,
    onChangeGalleryPageSize,
  } as const;
}

export { GALLERY_AUTO_SCROLL_SPEEDS, type GalleryAutoScrollSpeed };
