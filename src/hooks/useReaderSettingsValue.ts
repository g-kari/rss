"use client";

import { useMemo } from "react";
import type { ReaderSettings } from "../contexts/ReaderSettingsContext";

/**
 * ReaderSettings オブジェクトを 1 箇所で構築する hook (#650 Step 1l)。
 *
 * 全項目を 1 つの `useMemo` で集約することで、`<ReaderSettingsProvider value={...}>`
 * に渡す reference を安定化する (子コンポーネントの不要な再 render 抑制)。
 *
 * 元々 App.tsx 内に 86 行のインライン useMemo + 同じ deps を 2 回手書きする状態だったが、
 * メソッド数の増減で 2 箇所の同期更新が必要になりミスが起きやすかった。
 * フィールド名 = key の単純なオブジェクトなので、`Omit<ReaderSettings, never>` 相当の
 * 型を入力に取って useMemo の deps に展開するシンプルな構造で十分。
 *
 * 注意: 入力 props の field 順序は ReaderSettings 型と同じ順序を保つこと。
 * 新規プロパティを追加する際は、ReaderSettingsContext.ts と本 hook の両方を同時に更新する。
 *
 * **callback identity 安定性 (#719 audit 完了 — 2026-05-10)**:
 *
 * 本 hook の deps 配列に並ぶ 20+ callback はすべて以下のいずれかで identity 不変が保証される:
 *
 * 1. `useStoredSetting` / `useStoredBoolToggle` の戻り値 setter — `useCallback([key/onValue/offValue], ...)`
 *    で deps が **string literal** のため render 跨ぎで安定 (`useStoredSetting.ts`)
 * 2. `useCallback([], ...)` で deps 空のもの (例: `cycleAutoReadThreshold` / `onChangeAutoReadThreshold`
 *    / `onChangeAiModel` / `onChangeTextJustify` / `onChangeGalleryMinImagePx` / `toggleTheme`)
 * 3. `useCallback([ref, stable_callback, ...], ...)` で deps が **useSyncedRef オブジェクト
 *    or 上記安定 callback** のみ (例: `useFocusMode` の `toggleFocusMode` / `toggleListFocusMode`)
 *
 * **新規プロパティ追加時のチェックリスト**:
 * - source hook の callback は **`useCallback([])` or string-literal deps のみ** の `useCallback` か?
 * - state value (`Set<string>` / `Article[]` 等) を deps に含む callback は **NG** —
 *   含めると毎 render で新 reference になり ReaderSettings 全体が再生成 → 全 consumer
 *   (ArticleView / ArticleHeader / UserSettingsModal 等) が unnecessary に re-render される
 * - 違反すると `#650 Step 1l` の render-stability 確保目的が破綻する
 */
export function useReaderSettingsValue(input: ReaderSettings): ReaderSettings {
  return useMemo<ReaderSettings>(
    () => ({
      fontSize: input.fontSize,
      onChangeFontSize: input.onChangeFontSize,
      fontFamily: input.fontFamily,
      onChangeFontFamily: input.onChangeFontFamily,
      theme: input.theme,
      focusMode: input.focusMode,
      toggleFocusMode: input.toggleFocusMode,
      autoReadEnabled: input.autoReadEnabled,
      toggleAutoRead: input.toggleAutoRead,
      autoReadThreshold: input.autoReadThreshold,
      cycleAutoReadThreshold: input.cycleAutoReadThreshold,
      onChangeAutoReadThreshold: input.onChangeAutoReadThreshold,
      autoTranslate: input.autoTranslate,
      toggleAutoTranslate: input.toggleAutoTranslate,
      autoSummarize: input.autoSummarize,
      toggleAutoSummarize: input.toggleAutoSummarize,
      autoAiBrowserOnly: input.autoAiBrowserOnly,
      toggleAutoAiBrowserOnly: input.toggleAutoAiBrowserOnly,
      lineHeight: input.lineHeight,
      onChangeLineHeight: input.onChangeLineHeight,
      contentWidth: input.contentWidth,
      onChangeContentWidth: input.onChangeContentWidth,
      textJustify: input.textJustify,
      onChangeTextJustify: input.onChangeTextJustify,
      galleryColumns: input.galleryColumns,
      onChangeGalleryColumns: input.onChangeGalleryColumns,
      galleryColumnsFocus: input.galleryColumnsFocus,
      onChangeGalleryColumnsFocus: input.onChangeGalleryColumnsFocus,
      galleryCardSize: input.galleryCardSize,
      onChangeGalleryCardSize: input.onChangeGalleryCardSize,
      galleryMinImagePx: input.galleryMinImagePx,
      onChangeGalleryMinImagePx: input.onChangeGalleryMinImagePx,
      galleryAutoScrollSpeed: input.galleryAutoScrollSpeed,
      onChangeGalleryAutoScrollSpeed: input.onChangeGalleryAutoScrollSpeed,
      galleryPageSize: input.galleryPageSize,
      onChangeGalleryPageSize: input.onChangeGalleryPageSize,
      gallerySelfMasonryEnabled: input.gallerySelfMasonryEnabled,
      toggleGallerySelfMasonryEnabled: input.toggleGallerySelfMasonryEnabled,
      deduplicateByLink: input.deduplicateByLink,
      toggleDeduplicateByLink: input.toggleDeduplicateByLink,
      ttlDays: input.ttlDays,
      onChangeTtlDays: input.onChangeTtlDays,
      imageDlFolder: input.imageDlFolder,
      onChangeImageDlFolder: input.onChangeImageDlFolder,
      imageDlFolderNsfw: input.imageDlFolderNsfw,
      onChangeImageDlFolderNsfw: input.onChangeImageDlFolderNsfw,
      aiModel: input.aiModel,
      onChangeAiModel: input.onChangeAiModel,
    }),
    [
      input.fontSize,
      input.onChangeFontSize,
      input.fontFamily,
      input.onChangeFontFamily,
      input.theme,
      input.focusMode,
      input.toggleFocusMode,
      input.autoReadEnabled,
      input.toggleAutoRead,
      input.autoReadThreshold,
      input.cycleAutoReadThreshold,
      input.onChangeAutoReadThreshold,
      input.autoTranslate,
      input.toggleAutoTranslate,
      input.autoSummarize,
      input.toggleAutoSummarize,
      input.autoAiBrowserOnly,
      input.toggleAutoAiBrowserOnly,
      input.lineHeight,
      input.onChangeLineHeight,
      input.contentWidth,
      input.onChangeContentWidth,
      input.textJustify,
      input.onChangeTextJustify,
      input.galleryColumns,
      input.onChangeGalleryColumns,
      input.galleryColumnsFocus,
      input.onChangeGalleryColumnsFocus,
      input.galleryCardSize,
      input.onChangeGalleryCardSize,
      input.galleryMinImagePx,
      input.onChangeGalleryMinImagePx,
      input.galleryAutoScrollSpeed,
      input.onChangeGalleryAutoScrollSpeed,
      input.galleryPageSize,
      input.onChangeGalleryPageSize,
      input.gallerySelfMasonryEnabled,
      input.toggleGallerySelfMasonryEnabled,
      input.deduplicateByLink,
      input.toggleDeduplicateByLink,
      input.ttlDays,
      input.onChangeTtlDays,
      input.imageDlFolder,
      input.onChangeImageDlFolder,
      input.imageDlFolderNsfw,
      input.onChangeImageDlFolderNsfw,
      input.aiModel,
      input.onChangeAiModel,
    ],
  );
}
