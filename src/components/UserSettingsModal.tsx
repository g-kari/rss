"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import {
  diagnoseTranslatorAvailability,
  type TranslatorUnavailableReason,
} from "../lib/browser-translator";
import {
  FONT_SIZE_CYCLE,
  FONT_SIZE_LABELS,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
  FONT_SIZE_CLASSES,
  FONT_FAMILY_CLASSES,
} from "../lib/article-utils";
import {
  type ContentWidth,
  type LineHeight,
  LINE_HEIGHT_CYCLE,
  LINE_HEIGHT_LABELS,
  CONTENT_WIDTH_CYCLE,
  CONTENT_WIDTH_LABELS,
  GALLERY_COLUMNS_CYCLE,
  GALLERY_COLUMNS_LABELS,
  GALLERY_CARD_SIZE_CYCLE,
  GALLERY_CARD_SIZE_LABELS,
  GALLERY_MIN_IMAGE_PX_MIN,
  GALLERY_MIN_IMAGE_PX_MAX,
  GALLERY_MIN_IMAGE_PX_STEP,
  getLineHeightStyle,
} from "../lib/reader-settings";
import { AUTO_READ_THRESHOLD_CYCLE } from "../hooks/useUIState";
import { ARTICLE_TTL_DAYS } from "../lib/article-ttl";
import type { FontFamily, FontSize } from "../types";

interface Props {
  onClose: () => void;
}

// プレビュー領域内でのコンテンツ幅の視覚比率 (modal ~480px 内に収まる表示比率)
// 実値は 640 / 720 / 900 / none だが、モーダル内では全部が収まって見分けが付かないため
// 比率ベースで相対的な広さを表現する
const CONTENT_WIDTH_PREVIEW_PCT: Record<ContentWidth, number> = {
  narrow: 55,
  medium: 70,
  wide: 85,
  full: 100,
};

const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7日" },
  { value: 14, label: "14日" },
  { value: 30, label: "30日" },
  { value: 60, label: "60日" },
  { value: 90, label: "90日" },
  { value: 0, label: "無制限" },
];

const PREVIEW_TEXT =
  "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。" +
  "The quick brown fox jumps over the lazy dog. RSS リーダーの表示設定をプレビューしながら調整できますわ。";

/**
 * ユーザー設定モーダル (Issue #79)
 *
 * フォントサイズ・フォント・行間・コンテンツ幅・両端揃え・自動既読などの
 * 表示設定をプレビューしながら変更できるダイアログ。
 */
export default function UserSettingsModal({ onClose }: Props) {
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
    ttlDays,
    onChangeTtlDays,
  } = useReaderSettings();

  const [translatorDiag, setTranslatorDiag] = useState<{
    available: boolean;
    reason: TranslatorUnavailableReason;
  } | null>(null);

  useEffect(() => {
    diagnoseTranslatorAvailability().then(setTranslatorDiag);
  }, []);

  return (
    <Modal
      title="ユーザー設定"
      subtitle="記事表示のカスタマイズ"
      onClose={onClose}
      width="sm:w-[560px]"
    >
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
          />
        </SettingRow>

        <SettingRow label="フォント">
          <SegmentGroup
            options={FONT_FAMILY_CYCLE.map((v) => ({ value: v, label: FONT_FAMILY_LABELS[v] }))}
            value={fontFamily}
            onChange={onChangeFontFamily}
          />
        </SettingRow>

        <SettingRow label="行間">
          <SegmentGroup
            options={LINE_HEIGHT_CYCLE.map((v) => ({ value: v, label: LINE_HEIGHT_LABELS[v] }))}
            value={lineHeight}
            onChange={onChangeLineHeight}
          />
        </SettingRow>

        <SettingRow label="コンテンツ幅">
          <SegmentGroup
            options={CONTENT_WIDTH_CYCLE.map((v) => ({ value: v, label: CONTENT_WIDTH_LABELS[v] }))}
            value={contentWidth}
            onChange={onChangeContentWidth}
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
              />
            )}
          </div>
        </SettingRow>

        <SettingRow label="自動翻訳">
          <button
            type="button"
            role="switch"
            aria-checked={autoTranslate}
            aria-label={autoTranslate ? "自動翻訳を OFF にする" : "自動翻訳を ON にする"}
            onClick={toggleAutoTranslate}
            className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
              autoTranslate ? "bg-ink" : "bg-border-default"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                autoTranslate ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </SettingRow>

        {translatorDiag && (
          <div className="flex flex-col gap-1 pl-28">
            <span className="text-[11px] text-text-muted">
              利用プロバイダ:{" "}
              {translatorDiag.available ? (
                <span className="text-text-default">Chrome 翻訳 &#x2713;</span>
              ) : (
                <span className="text-text-default">Workers AI (フォールバック)</span>
              )}
            </span>
            {!translatorDiag.available && translatorDiag.reason && (
              <span className="text-[10px] text-text-faint">
                {translatorDiag.reason === "not-chromium" &&
                  "Chrome/Edge 以外のブラウザでは Chrome 翻訳を利用できません"}
                {translatorDiag.reason === "flag-disabled" &&
                  "chrome://flags/#translation-api を Enabled にすると Chrome 翻訳が利用できます"}
                {translatorDiag.reason === "not-available" &&
                  "言語パックが利用できません。Chrome の設定から言語を追加してください"}
              </span>
            )}
          </div>
        )}

        <p className="text-[11px] text-text-muted">
          変更は即座にプレビューに反映され、自動的に保存されますわ。
        </p>
      </div>
    </Modal>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] font-medium text-text-default flex-shrink-0 w-24">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

interface SegmentOption<T> {
  value: T;
  label: string;
}

function SegmentGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border-default overflow-hidden">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-[11px] transition-colors duration-150 ${
              active
                ? "bg-ink text-ink-text"
                : "bg-surface-elevated text-text-muted hover:bg-surface-hover hover:text-text-default"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PreviewArea({
  fontSize,
  fontFamily,
  lineHeight,
  contentWidth,
  textJustify,
}: {
  fontSize: FontSize;
  fontFamily: FontFamily;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  textJustify: boolean;
}) {
  return (
    <div className="border border-border-subtle rounded-lg p-3 bg-surface-base">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          Preview
        </span>
        <span className="text-[10px] text-text-faint">幅 {CONTENT_WIDTH_LABELS[contentWidth]}</span>
      </div>
      <div
        className={`mx-auto ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} text-text-soft tracking-[0.02em]`}
        style={{
          ...getLineHeightStyle(lineHeight),
          width: `${CONTENT_WIDTH_PREVIEW_PCT[contentWidth]}%`,
          textAlign: textJustify ? "justify" : "left",
        }}
      >
        {PREVIEW_TEXT}
      </div>
    </div>
  );
}
