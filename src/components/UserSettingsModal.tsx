"use client";

import { useLayoutEffect, useRef, useState } from "react";
import SettingsNavigation from "./user-settings/SettingsNavigation";
import { type SettingDestination, type SettingsCategoryId } from "./user-settings/settings-catalog";
import Modal from "./Modal";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useHeaderShareTargets } from "../hooks/useHeaderShareTargets";
import type { Article, Collection, Feed } from "../types";
import DisplayTabPanel from "./user-settings/DisplayTabPanel";
import AiNotificationTabPanel from "./user-settings/AiNotificationTabPanel";
import FeedManagementTabPanel from "./user-settings/FeedManagementTabPanel";
import ImportExportTabPanel from "./user-settings/ImportExportTabPanel";

interface Props {
  userId: string;
  onClose: () => void;
  feeds: Feed[];
  articles: Article[];
  setNote: (articleId: string, text: string) => void;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  collections: Collection[];
  addArticlesToCollection: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
}

/**
 * ユーザー設定モーダル (Issue #79, #479, #502)
 *
 * 目的別の設定カテゴリとローカル検索。各 controller は mount を維持する。
 *
 * 各タブの実装は src/components/user-settings/ 配下のコンポーネントに委譲。
 */
export default function UserSettingsModal({
  userId,
  onClose,
  feeds,
  articles,
  setNote,
  bookmarkIds,
  readingListIds,
  toggleBookmark,
  toggleReadingList,
  collections,
  addArticlesToCollection,
}: Props) {
  const {
    theme,
    setTheme,
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    lineHeight,
    onChangeLineHeight,
    contentWidth,
    onChangeContentWidth,
    textJustify,
    onChangeTextJustify,
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
    autoSummarize,
    toggleAutoSummarize,
    autoAiBrowserOnly,
    toggleAutoAiBrowserOnly,
    galleryColumns,
    onChangeGalleryColumns,
    galleryColumnsFocus,
    onChangeGalleryColumnsFocus,
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
    galleryAutoScrollSpeed,
    onChangeGalleryAutoScrollSpeed,
    galleryPageSize,
    onChangeGalleryPageSize,
    deduplicateByLink,
    toggleDeduplicateByLink,
    ttlDays,
    onChangeTtlDays,
    imageDlFolder,
    onChangeImageDlFolder,
    imageDlFolderNsfw,
    onChangeImageDlFolderNsfw,
    aiProvider,
    onChangeAiProvider,
    aiModel,
    onChangeAiModel,
  } = useReaderSettings();

  const [headerShareTargetIds, setHeaderShareTargetIds] = useHeaderShareTargets();

  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("reading");
  const [destination, setDestination] = useState<SettingDestination | null>(null);
  const [unavailable, setUnavailable] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Only an explicit result click focuses a control. Typing never opens a category,
  // creates tokens, calls AI, or changes settings. Keep all controllers mounted.
  useLayoutEffect(() => {
    if (!destination) return;
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>(
      destination.selector ?? `[data-setting-id="${destination.id}"]`,
    );
    const candidates = target?.matches("input, select, button")
      ? [target]
      : Array.from(
          target?.querySelectorAll<HTMLElement>(
            '[role="radio"][aria-checked="true"], input:not([type="file"]), select, button',
          ) ?? [],
        );
    const control = candidates.find(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        element.getAttribute("aria-disabled") !== "true" &&
        !element.closest("[hidden]"),
    );
    const panel = root?.querySelector<HTMLElement>(`#panel-${destination.category}`);
    const available = target && !target.closest("[hidden]") && control;
    const focusTarget = available
      ? control
      : target && !target.closest("[hidden]") && !target.matches(":disabled")
        ? target
        : panel;
    if (focusTarget) {
      // Account for the sticky search/category header when revealing a lower control.
      const navigation = root?.querySelector<HTMLElement>("[data-settings-navigation]");
      focusTarget.style.scrollMarginTop = `${(navigation?.getBoundingClientRect().height ?? 0) + 12}px`;
      focusTarget.focus({ preventScroll: true });
      focusTarget.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
    if (!available)
      setUnavailable(
        `「${destination.label}」は、現在の設定やこのブラウザの対応状況によって利用できません。カテゴリ内の説明を確認してください。`,
      );
    setDestination(null);
  }, [destination]);

  return (
    <Modal
      title="ユーザー設定"
      subtitle="目的別に設定を探して調整"
      onClose={onClose}
      width="sm:w-[640px]"
      height="h-[90dvh] sm:h-[700px]"
    >
      <div ref={rootRef}>
        <SettingsNavigation
          activeCategory={activeCategory}
          onCategoryChange={(category) => {
            setActiveCategory(category);
            setUnavailable("");
            // Each purpose category starts at its own heading; keep search-result
            // navigation separate so it can reveal the selected control instead.
            const scrollBody = rootRef.current?.parentElement;
            if (scrollBody) scrollBody.scrollTop = 0;
          }}
          onSettingSelect={(setting) => {
            setActiveCategory(setting.category);
            setUnavailable("");
            setDestination(setting);
          }}
        />
        {unavailable && (
          <p role="status" className="px-5 pt-3 text-[12px] text-text-muted">
            {unavailable}
          </p>
        )}

        <DisplayTabPanel
          activeCategory={activeCategory}
          theme={theme}
          setTheme={setTheme}
          fontSize={fontSize}
          onChangeFontSize={onChangeFontSize}
          fontFamily={fontFamily}
          onChangeFontFamily={onChangeFontFamily}
          lineHeight={lineHeight}
          onChangeLineHeight={onChangeLineHeight}
          contentWidth={contentWidth}
          onChangeContentWidth={onChangeContentWidth}
          textJustify={textJustify}
          onChangeTextJustify={onChangeTextJustify}
          galleryColumns={galleryColumns}
          onChangeGalleryColumns={onChangeGalleryColumns}
          galleryColumnsFocus={galleryColumnsFocus}
          onChangeGalleryColumnsFocus={onChangeGalleryColumnsFocus}
          galleryCardSize={galleryCardSize}
          onChangeGalleryCardSize={onChangeGalleryCardSize}
          galleryMinImagePx={galleryMinImagePx}
          onChangeGalleryMinImagePx={onChangeGalleryMinImagePx}
          galleryAutoScrollSpeed={galleryAutoScrollSpeed}
          onChangeGalleryAutoScrollSpeed={onChangeGalleryAutoScrollSpeed}
          galleryPageSize={galleryPageSize}
          onChangeGalleryPageSize={onChangeGalleryPageSize}
          autoReadEnabled={autoReadEnabled}
          toggleAutoRead={toggleAutoRead}
          autoReadThreshold={autoReadThreshold}
          onChangeAutoReadThreshold={onChangeAutoReadThreshold}
          ttlDays={ttlDays}
          onChangeTtlDays={onChangeTtlDays}
          deduplicateByLink={deduplicateByLink}
          toggleDeduplicateByLink={toggleDeduplicateByLink}
          imageDlFolder={imageDlFolder}
          onChangeImageDlFolder={onChangeImageDlFolder}
          imageDlFolderNsfw={imageDlFolderNsfw}
          onChangeImageDlFolderNsfw={onChangeImageDlFolderNsfw}
          headerShareTargetIds={headerShareTargetIds}
          setHeaderShareTargetIds={setHeaderShareTargetIds}
        />

        <AiNotificationTabPanel
          userId={userId}
          hidden={activeCategory !== "ai" && activeCategory !== "notifications"}
          activeCategory={activeCategory}
          autoTranslate={autoTranslate}
          toggleAutoTranslate={toggleAutoTranslate}
          autoSummarize={autoSummarize}
          toggleAutoSummarize={toggleAutoSummarize}
          autoAiBrowserOnly={autoAiBrowserOnly}
          toggleAutoAiBrowserOnly={toggleAutoAiBrowserOnly}
          aiProvider={aiProvider}
          onChangeAiProvider={onChangeAiProvider}
          aiModel={aiModel}
          onChangeAiModel={onChangeAiModel}
        />

        <FeedManagementTabPanel hidden={activeCategory !== "feeds"} feeds={feeds} />

        <ImportExportTabPanel
          userId={userId}
          hidden={activeCategory !== "import-export"}
          articles={articles}
          setNote={setNote}
          bookmarkIds={bookmarkIds}
          readingListIds={readingListIds}
          toggleBookmark={toggleBookmark}
          toggleReadingList={toggleReadingList}
          collections={collections}
          addArticlesToCollection={addArticlesToCollection}
        />
      </div>
    </Modal>
  );
}
