"use client";

import { useState, type KeyboardEvent } from "react";
import Modal from "./Modal";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useHeaderShareTargets } from "../hooks/useHeaderShareTargets";
import type { Article, Collection, Feed } from "../types";
import DisplayTabPanel from "./user-settings/DisplayTabPanel";
import AiNotificationTabPanel from "./user-settings/AiNotificationTabPanel";
import FeedManagementTabPanel from "./user-settings/FeedManagementTabPanel";
import ImportExportTabPanel from "./user-settings/ImportExportTabPanel";

interface Props {
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
 * タブ形式で設定カテゴリを分類。
 * 表示 / AI・通知 / フィード管理 / インポート・エクスポート
 *
 * 各タブの実装は src/components/user-settings/ 配下のコンポーネントに委譲。
 */
export default function UserSettingsModal({
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
    aiModel,
    onChangeAiModel,
  } = useReaderSettings();

  const [headerShareTargetIds, setHeaderShareTargetIds] = useHeaderShareTargets();

  type TabId = "display" | "ai-notifications" | "feeds" | "import-export";
  const [activeTab, setActiveTab] = useState<TabId>("display");

  const TABS: { id: TabId; label: string }[] = [
    { id: "display", label: "表示" },
    { id: "ai-notifications", label: "AI・通知" },
    { id: "feeds", label: "フィード管理" },
    { id: "import-export", label: "インポート・エクスポート" },
  ];

  // WAI-ARIA Authoring Practices §3.21 (Tabs Pattern):
  // - ArrowLeft / ArrowRight でタブ間を移動 (端でループ)
  // - active タブのみ tabIndex=0、他は tabIndex=-1 (roving tabindex)
  // - Home / End で先頭・末尾へジャンプ
  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TABS.findIndex((t) => t.id === activeTab);
    let nextIndex = -1;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex < 0) return;
    e.preventDefault();
    const nextTab = TABS[nextIndex];
    setActiveTab(nextTab.id);
    // フォーカスを次のタブボタンに移動 (roving tabindex pattern)。tablist (e.currentTarget) に
    // scope して querySelector する (document.getElementById だと同名 id が複数 mount したとき
    // 別 instance に focus が移る scope 漏れになる、#tablist-scope canonical)。
    const nextEl = e.currentTarget.querySelector<HTMLElement>(`#tab-${nextTab.id}`);
    nextEl?.focus();
  };

  return (
    <Modal
      title="ユーザー設定"
      subtitle="記事表示のカスタマイズ"
      onClose={onClose}
      width="sm:w-[560px]"
      height="sm:h-[640px]"
    >
      {/* タブナビゲーション */}
      <div
        role="tablist"
        aria-label="設定カテゴリ"
        onKeyDown={handleTabKeyDown}
        className="flex border-b border-border-default overflow-x-auto flex-shrink-0"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[13px] border-b-2 whitespace-nowrap transition-colors flex-shrink-0 ${
              activeTab === tab.id
                ? "border-ink text-text-strong font-medium"
                : "border-transparent text-text-muted hover:text-text-default"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DisplayTabPanel
        hidden={activeTab !== "display"}
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
        hidden={activeTab !== "ai-notifications"}
        autoTranslate={autoTranslate}
        toggleAutoTranslate={toggleAutoTranslate}
        autoSummarize={autoSummarize}
        toggleAutoSummarize={toggleAutoSummarize}
        autoAiBrowserOnly={autoAiBrowserOnly}
        toggleAutoAiBrowserOnly={toggleAutoAiBrowserOnly}
        aiModel={aiModel}
        onChangeAiModel={onChangeAiModel}
      />

      <FeedManagementTabPanel hidden={activeTab !== "feeds"} feeds={feeds} />

      <ImportExportTabPanel
        hidden={activeTab !== "import-export"}
        articles={articles}
        setNote={setNote}
        bookmarkIds={bookmarkIds}
        readingListIds={readingListIds}
        toggleBookmark={toggleBookmark}
        toggleReadingList={toggleReadingList}
        collections={collections}
        addArticlesToCollection={addArticlesToCollection}
      />
    </Modal>
  );
}
