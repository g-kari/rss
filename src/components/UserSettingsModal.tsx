"use client";

import { useState } from "react";
import Modal from "./Modal";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useHeaderShareTargets } from "../hooks/useHeaderShareTargets";
import type { Feed } from "../types";
import DisplayTabPanel from "./user-settings/DisplayTabPanel";
import AiNotificationTabPanel from "./user-settings/AiNotificationTabPanel";
import FeedManagementTabPanel from "./user-settings/FeedManagementTabPanel";
import ImportExportTabPanel from "./user-settings/ImportExportTabPanel";

interface Props {
  onClose: () => void;
  feeds: Feed[];
}

/**
 * ユーザー設定モーダル (Issue #79, #479, #502)
 *
 * タブ形式で設定カテゴリを分類。
 * 表示 / AI・通知 / フィード管理 / インポート・エクスポート
 *
 * 各タブの実装は src/components/user-settings/ 配下のコンポーネントに委譲。
 */
export default function UserSettingsModal({ onClose, feeds }: Props) {
  const {
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
    galleryColumns,
    onChangeGalleryColumns,
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
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

  return (
    <Modal
      title="ユーザー設定"
      subtitle="記事表示のカスタマイズ"
      onClose={onClose}
      width="sm:w-[560px]"
    >
      {/* タブナビゲーション */}
      <div
        role="tablist"
        aria-label="設定カテゴリ"
        className="flex border-b border-border-default overflow-x-auto flex-shrink-0"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
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
        galleryCardSize={galleryCardSize}
        onChangeGalleryCardSize={onChangeGalleryCardSize}
        galleryMinImagePx={galleryMinImagePx}
        onChangeGalleryMinImagePx={onChangeGalleryMinImagePx}
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
        aiModel={aiModel}
        onChangeAiModel={onChangeAiModel}
      />

      <FeedManagementTabPanel hidden={activeTab !== "feeds"} feeds={feeds} />

      <ImportExportTabPanel hidden={activeTab !== "import-export"} />
    </Modal>
  );
}
