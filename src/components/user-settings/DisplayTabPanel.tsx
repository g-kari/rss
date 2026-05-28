"use client";

import type { FontSize, FontFamily } from "../../types";
import type { ContentWidth, LineHeight } from "../../lib/reader-settings";
import {
  GALLERY_COLUMNS_CYCLE,
  GALLERY_CARD_SIZE_CYCLE,
  type GalleryPageSize,
} from "../../lib/reader-settings";
import { AUTO_READ_THRESHOLD_CYCLE } from "../../hooks/useAutoReadSettings";
import { type GalleryAutoScrollSpeed } from "../../lib/gallery-autoscroll";
import { type ShareTargetId } from "../article-view/shareTargets";
import { SettingRow, PreviewArea } from "./shared";
import TtsVoiceSection from "./TtsVoiceSection";
import FontSection from "./FontSection";
import LayoutSection from "./LayoutSection";
import GallerySection from "./GallerySection";
import AutoReadSection from "./AutoReadSection";
import ImageDlSection from "./ImageDlSection";
import { useThemePresets } from "../../hooks/useThemePresets";
import { THEME_PRESET_NAME_MAX_LENGTH, THEME_PRESET_NAME_MIN_LENGTH } from "../../lib/theme-preset";
import type { Theme } from "../../hooks/useThemePreference";
import { useState } from "react";

interface DisplayTabPanelProps {
  hidden: boolean;
  // Theme (for preset 適用、UI で theme 単体変更はしない)
  theme: Theme;
  setTheme: (v: Theme) => void;
  // Font
  fontSize: FontSize;
  onChangeFontSize: (v: FontSize) => void;
  fontFamily: FontFamily;
  onChangeFontFamily: (v: FontFamily) => void;
  // Layout
  lineHeight: LineHeight;
  onChangeLineHeight: (v: LineHeight) => void;
  contentWidth: ContentWidth;
  onChangeContentWidth: (v: ContentWidth) => void;
  textJustify: boolean;
  onChangeTextJustify: (v: boolean) => void;
  // Gallery
  galleryColumns: (typeof GALLERY_COLUMNS_CYCLE)[number];
  onChangeGalleryColumns: (v: (typeof GALLERY_COLUMNS_CYCLE)[number]) => void;
  galleryColumnsFocus: (typeof GALLERY_COLUMNS_CYCLE)[number];
  onChangeGalleryColumnsFocus: (v: (typeof GALLERY_COLUMNS_CYCLE)[number]) => void;
  galleryCardSize: (typeof GALLERY_CARD_SIZE_CYCLE)[number];
  onChangeGalleryCardSize: (v: (typeof GALLERY_CARD_SIZE_CYCLE)[number]) => void;
  galleryMinImagePx: number;
  onChangeGalleryMinImagePx: (v: number) => void;
  // Gallery auto-scroll (#690)
  galleryAutoScrollSpeed: GalleryAutoScrollSpeed;
  onChangeGalleryAutoScrollSpeed: (v: GalleryAutoScrollSpeed) => void;
  // Gallery page size (#714 関連): 1 ページの記事件数 (50 / 100 / 200 / 500)
  galleryPageSize: GalleryPageSize;
  onChangeGalleryPageSize: (v: GalleryPageSize) => void;
  // Auto read
  autoReadEnabled: boolean;
  toggleAutoRead: () => void;
  autoReadThreshold: (typeof AUTO_READ_THRESHOLD_CYCLE)[number];
  onChangeAutoReadThreshold: (v: (typeof AUTO_READ_THRESHOLD_CYCLE)[number]) => void;
  // TTL
  ttlDays: number | null;
  onChangeTtlDays: (v: number | null) => void;
  // Dedup
  deduplicateByLink: boolean;
  toggleDeduplicateByLink: () => void;
  // Image download folders
  imageDlFolder: string;
  onChangeImageDlFolder: (v: string) => void;
  imageDlFolderNsfw: string;
  onChangeImageDlFolderNsfw: (v: string) => void;
  // Share targets
  headerShareTargetIds: ShareTargetId[];
  setHeaderShareTargetIds: (ids: ShareTargetId[]) => void;
}

export default function DisplayTabPanel({
  hidden,
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
  autoReadEnabled,
  toggleAutoRead,
  autoReadThreshold,
  onChangeAutoReadThreshold,
  ttlDays,
  onChangeTtlDays,
  deduplicateByLink,
  toggleDeduplicateByLink,
  imageDlFolder,
  onChangeImageDlFolder,
  imageDlFolderNsfw,
  onChangeImageDlFolderNsfw,
  headerShareTargetIds,
  setHeaderShareTargetIds,
}: DisplayTabPanelProps) {
  const { presets, savePreset, deletePreset } = useThemePresets();
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const handleApplyPreset = () => {
    const target = presets.find((p) => p.id === selectedPresetId);
    if (!target) return;
    // 順次適用: theme → font → layout (1 つでも失敗しても他は適用継続、order に
    // ユーザー視認の意味なし)
    setTheme(target.theme);
    onChangeFontSize(target.fontSize);
    onChangeFontFamily(target.fontFamily);
    onChangeLineHeight(target.lineHeight);
    onChangeContentWidth(target.contentWidth);
  };

  const handleSaveCurrent = () => {
    const raw = typeof window !== "undefined" ? window.prompt("preset 名 (1-30 文字)") : null;
    if (raw === null) return;
    const name = raw.trim();
    if (name.length < THEME_PRESET_NAME_MIN_LENGTH || name.length > THEME_PRESET_NAME_MAX_LENGTH) {
      if (typeof window !== "undefined") {
        window.alert(
          `preset 名は ${THEME_PRESET_NAME_MIN_LENGTH}-${THEME_PRESET_NAME_MAX_LENGTH} 文字で指定してください`,
        );
      }
      return;
    }
    savePreset(name, { theme, fontSize, fontFamily, lineHeight, contentWidth });
  };

  return (
    <div id="panel-display" role="tabpanel" aria-labelledby="tab-display" hidden={hidden}>
      <div className="flex flex-col gap-5 px-5 py-4">
        <PreviewArea
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          contentWidth={contentWidth}
          textJustify={textJustify}
        />

        {/* Theme preset (theme + font + layout の組み合わせを名前付き保存・呼び出し) */}
        <SettingRow label="プリセット">
          <div className="flex flex-col gap-1.5 w-full items-end">
            <div className="flex items-center gap-1.5 w-full justify-end flex-wrap">
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                disabled={presets.length === 0}
                aria-label="保存済みプリセット"
                className="px-2 py-1 text-[11px] rounded-md border border-border-default bg-surface-elevated text-text-default disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-ink transition-colors"
              >
                {presets.length === 0 ? (
                  <option value="">preset なし</option>
                ) : (
                  <>
                    <option value="">選択...</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <button
                type="button"
                onClick={handleApplyPreset}
                disabled={!selectedPresetId}
                className="px-2.5 py-1 text-[11px] rounded-md bg-ink text-ink-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                適用
              </button>
              <button
                type="button"
                onClick={handleSaveCurrent}
                className="px-2.5 py-1 text-[11px] rounded-md border border-border-default text-text-default hover:bg-surface-hover transition-colors"
              >
                現在の設定を保存
              </button>
            </div>
            {presets.length > 0 && (
              <ul className="flex flex-col gap-0.5 w-full">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-[11px] text-text-muted px-1"
                  >
                    <span className="truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        deletePreset(p.id);
                        if (selectedPresetId === p.id) setSelectedPresetId("");
                      }}
                      aria-label={`プリセット「${p.name}」を削除`}
                      className="text-text-muted hover:text-error transition-colors px-1.5 py-0.5 rounded"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingRow>

        <FontSection
          fontSize={fontSize}
          onChangeFontSize={onChangeFontSize}
          fontFamily={fontFamily}
          onChangeFontFamily={onChangeFontFamily}
        />

        <LayoutSection
          lineHeight={lineHeight}
          onChangeLineHeight={onChangeLineHeight}
          contentWidth={contentWidth}
          onChangeContentWidth={onChangeContentWidth}
          textJustify={textJustify}
          onChangeTextJustify={onChangeTextJustify}
        />

        <GallerySection
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
        />

        <AutoReadSection
          autoReadEnabled={autoReadEnabled}
          toggleAutoRead={toggleAutoRead}
          autoReadThreshold={autoReadThreshold}
          onChangeAutoReadThreshold={onChangeAutoReadThreshold}
        />

        <ImageDlSection
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

        <TtsVoiceSection />

        <p className="text-[11px] text-text-muted">
          変更は即座にプレビューに反映され、自動的に保存されますわ。
        </p>
      </div>
    </div>
  );
}
