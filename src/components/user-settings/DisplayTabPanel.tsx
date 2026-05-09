"use client";

import type { FontSize, FontFamily } from "../../types";
import type { ContentWidth, LineHeight } from "../../lib/reader-settings";
import {
  LINE_HEIGHT_CYCLE,
  LINE_HEIGHT_LABELS,
  CONTENT_WIDTH_CYCLE,
  CONTENT_WIDTH_LABELS,
  GALLERY_COLUMNS_CYCLE,
  GALLERY_COLUMNS_LABELS,
  GALLERY_COLUMNS_FOCUS_LABELS,
  GALLERY_CARD_SIZE_CYCLE,
  GALLERY_CARD_SIZE_LABELS,
  GALLERY_MIN_IMAGE_PX_MIN,
  GALLERY_MIN_IMAGE_PX_MAX,
  GALLERY_MIN_IMAGE_PX_STEP,
} from "../../lib/reader-settings";
import {
  FONT_SIZE_CYCLE,
  FONT_SIZE_LABELS,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
} from "../../lib/article-utils";
import { AUTO_READ_THRESHOLD_CYCLE } from "../../hooks/useAutoReadSettings";
import {
  GALLERY_AUTO_SCROLL_SPEEDS,
  type GalleryAutoScrollSpeed,
} from "../../lib/gallery-autoscroll";
import { ARTICLE_TTL_DAYS } from "../../lib/article-ttl";
import { SHARE_TARGETS, type ShareTargetId } from "../article-view/shareTargets";
import { SettingRow, SegmentGroup, PreviewArea, TTL_OPTIONS } from "./shared";
import TtsVoiceSection from "./TtsVoiceSection";

interface DisplayTabPanelProps {
  hidden: boolean;
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

        <SettingRow label="フォントサイズ">
          <SegmentGroup
            options={FONT_SIZE_CYCLE.map((v) => ({
              value: v,
              label: FONT_SIZE_LABELS[v],
            }))}
            value={fontSize}
            onChange={onChangeFontSize}
            ariaLabel="フォントサイズ"
          />
        </SettingRow>

        <SettingRow label="フォント">
          <SegmentGroup
            options={FONT_FAMILY_CYCLE.map((v) => ({
              value: v,
              label: FONT_FAMILY_LABELS[v],
            }))}
            value={fontFamily}
            onChange={onChangeFontFamily}
            ariaLabel="フォント"
          />
        </SettingRow>

        <SettingRow label="行間">
          <SegmentGroup
            options={LINE_HEIGHT_CYCLE.map((v) => ({
              value: v,
              label: LINE_HEIGHT_LABELS[v],
            }))}
            value={lineHeight}
            onChange={onChangeLineHeight}
            ariaLabel="行間"
          />
        </SettingRow>

        <SettingRow label="コンテンツ幅">
          <SegmentGroup
            options={CONTENT_WIDTH_CYCLE.map((v) => ({
              value: v,
              label: CONTENT_WIDTH_LABELS[v],
            }))}
            value={contentWidth}
            onChange={onChangeContentWidth}
            ariaLabel="コンテンツ幅"
          />
        </SettingRow>

        <SettingRow label="ギャラリー列数">
          <SegmentGroup
            options={GALLERY_COLUMNS_CYCLE.map((v) => ({
              value: v,
              label: GALLERY_COLUMNS_LABELS[v],
            }))}
            value={galleryColumns}
            onChange={onChangeGalleryColumns}
            ariaLabel="ギャラリー列数"
          />
        </SettingRow>

        <SettingRow label="フォーカス時列数">
          <SegmentGroup
            options={GALLERY_COLUMNS_CYCLE.map((v) => ({
              value: v,
              label: GALLERY_COLUMNS_FOCUS_LABELS[v],
            }))}
            value={galleryColumnsFocus}
            onChange={onChangeGalleryColumnsFocus}
            ariaLabel="フォーカスモード時のギャラリー列数"
          />
        </SettingRow>

        <SettingRow label="カードサイズ">
          <SegmentGroup
            options={GALLERY_CARD_SIZE_CYCLE.map((v) => ({
              value: v,
              label: GALLERY_CARD_SIZE_LABELS[v],
            }))}
            value={galleryCardSize}
            onChange={onChangeGalleryCardSize}
            ariaLabel="カードサイズ"
          />
        </SettingRow>

        <SettingRow label="最小画像サイズ">
          <div className="flex items-center gap-2 w-full">
            <input
              type="range"
              min={GALLERY_MIN_IMAGE_PX_MIN}
              max={GALLERY_MIN_IMAGE_PX_MAX}
              step={GALLERY_MIN_IMAGE_PX_STEP}
              value={galleryMinImagePx}
              onChange={(e) => onChangeGalleryMinImagePx(Number(e.target.value))}
              className="flex-1 accent-ink h-1 cursor-pointer"
            />
            <span className="text-[11px] text-text-muted tabular-nums w-10 text-right">
              {galleryMinImagePx === 0 ? "なし" : `${galleryMinImagePx}px`}
            </span>
          </div>
        </SettingRow>

        <SettingRow label="自動スクロール">
          <SegmentGroup
            options={GALLERY_AUTO_SCROLL_SPEEDS.map((v) => ({
              value: v,
              label:
                v === "off"
                  ? "OFF"
                  : v === "slow"
                    ? "遅"
                    : v === "medium"
                      ? "中"
                      : v === "fast"
                        ? "速"
                        : "スライドショー",
            }))}
            value={galleryAutoScrollSpeed}
            onChange={onChangeGalleryAutoScrollSpeed}
            ariaLabel="ギャラリー自動スクロール速度"
          />
        </SettingRow>
        <p className="text-[11px] text-text-muted pl-28 -mt-2">
          ギャラリービュー表示中、自動でスクロール / スライドショー再生しますわ。手動でスクロール
          (ホイール / タッチ) すると OFF に戻りますの。
        </p>

        <SettingRow label="記事保持期間">
          <div className="flex gap-1">
            {TTL_OPTIONS.map((opt) => {
              const current = ttlDays ?? 30;
              const isSelected = opt.value === current;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeTtlDays(opt.value === ARTICLE_TTL_DAYS ? null : opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                    isSelected
                      ? "bg-ink text-ink-text"
                      : "text-text-muted hover:text-text-default hover:bg-surface-hover"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow label="両端揃え">
          <button
            type="button"
            role="switch"
            aria-checked={textJustify}
            aria-label={textJustify ? "両端揃えを OFF にする" : "両端揃えを ON にする"}
            onClick={() => onChangeTextJustify(!textJustify)}
            className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
              textJustify ? "bg-ink" : "bg-border-default"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                textJustify ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </SettingRow>

        <SettingRow label="自動既読">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={autoReadEnabled}
              aria-label={autoReadEnabled ? "自動既読を OFF にする" : "自動既読を ON にする"}
              onClick={toggleAutoRead}
              className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
                autoReadEnabled ? "bg-ink" : "bg-border-default"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                  autoReadEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            {autoReadEnabled && (
              <SegmentGroup
                options={AUTO_READ_THRESHOLD_CYCLE.map((v) => ({ value: v, label: `${v}%` }))}
                value={autoReadThreshold}
                onChange={onChangeAutoReadThreshold}
                ariaLabel="自動既読タイミング"
              />
            )}
          </div>
        </SettingRow>

        <SettingRow label="重複記事の非表示">
          <button
            type="button"
            role="switch"
            aria-checked={deduplicateByLink}
            aria-label={
              deduplicateByLink
                ? "クロスフィード重複排除を OFF にする"
                : "クロスフィード重複排除を ON にする"
            }
            onClick={toggleDeduplicateByLink}
            className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
              deduplicateByLink ? "bg-ink" : "bg-border-default"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                deduplicateByLink ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </SettingRow>
        <div className="flex flex-col gap-1 pl-28">
          <span className="text-[11px] text-text-muted">
            同一 URL の記事が複数フィードにある場合、最新の 1 件のみ表示します。
          </span>
        </div>

        <SettingRow label="画像保存フォルダー">
          <input
            type="text"
            placeholder="フォルダ名（空欄: デフォルト）"
            value={imageDlFolder}
            onChange={(e) => onChangeImageDlFolder(e.target.value)}
            className="w-full max-w-[200px] px-2 py-1 text-[11px] rounded-md border border-border-default bg-surface-elevated text-text-default placeholder:text-text-faint focus:outline-none focus:border-ink transition-colors"
          />
        </SettingRow>

        <SettingRow label="画像DL先(NSFW)">
          <input
            type="text"
            placeholder="フォルダ名（空欄: 通常と同じ）"
            value={imageDlFolderNsfw}
            onChange={(e) => onChangeImageDlFolderNsfw(e.target.value)}
            className="w-full max-w-[200px] px-2 py-1 text-[11px] rounded-md border border-border-default bg-surface-elevated text-text-default placeholder:text-text-faint focus:outline-none focus:border-ink transition-colors"
          />
        </SettingRow>
        <div className="flex flex-col gap-1 pl-28">
          <span className="text-[11px] text-text-muted">
            画像ダウンロード時のファイル名にフォルダプレフィックスを付与します。
          </span>
        </div>

        <TtsVoiceSection />

        <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
          <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
            シェア設定
          </span>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-text-default">
              ヘッダーに表示するシェア先
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
              {SHARE_TARGETS.map((target) => {
                const checked = headerShareTargetIds.includes(target.id);
                return (
                  <label
                    key={target.id}
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? headerShareTargetIds.filter((id) => id !== target.id)
                          : [...headerShareTargetIds, target.id as ShareTargetId];
                        setHeaderShareTargetIds(next);
                      }}
                      className="accent-ink w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[12px] text-text-default">{target.label}</span>
                  </label>
                );
              })}
            </div>
            <span className="text-[11px] text-text-muted mt-0.5">
              チェックしたシェア先が記事ヘッダーにクイックボタンとして表示されます。
            </span>
          </div>
        </div>

        <p className="text-[11px] text-text-muted">
          変更は即座にプレビューに反映され、自動的に保存されますわ。
        </p>
      </div>
    </div>
  );
}
