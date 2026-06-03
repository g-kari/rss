"use client";

import {
  GALLERY_COLUMNS_CYCLE,
  GALLERY_COLUMNS_LABELS,
  GALLERY_COLUMNS_FOCUS_LABELS,
  GALLERY_CARD_SIZE_CYCLE,
  GALLERY_CARD_SIZE_LABELS,
  GALLERY_MIN_IMAGE_PX_MIN,
  GALLERY_MIN_IMAGE_PX_MAX,
  GALLERY_MIN_IMAGE_PX_STEP,
  GALLERY_PAGE_SIZE_CYCLE,
  GALLERY_PAGE_SIZE_LABELS,
  type GalleryPageSize,
} from "../../lib/reader-settings";
import {
  GALLERY_AUTO_SCROLL_SPEEDS,
  type GalleryAutoScrollSpeed,
} from "../../lib/gallery-autoscroll";
import { SettingRow, SegmentGroup } from "./shared";

const GALLERY_AUTO_SCROLL_LABELS: Record<GalleryAutoScrollSpeed, string> = {
  off: "OFF",
  slow: "遅",
  medium: "中",
  fast: "速",
  slideshow: "スライドショー",
};

interface GallerySectionProps {
  galleryColumns: (typeof GALLERY_COLUMNS_CYCLE)[number];
  onChangeGalleryColumns: (v: (typeof GALLERY_COLUMNS_CYCLE)[number]) => void;
  galleryColumnsFocus: (typeof GALLERY_COLUMNS_CYCLE)[number];
  onChangeGalleryColumnsFocus: (v: (typeof GALLERY_COLUMNS_CYCLE)[number]) => void;
  galleryCardSize: (typeof GALLERY_CARD_SIZE_CYCLE)[number];
  onChangeGalleryCardSize: (v: (typeof GALLERY_CARD_SIZE_CYCLE)[number]) => void;
  galleryMinImagePx: number;
  onChangeGalleryMinImagePx: (v: number) => void;
  galleryAutoScrollSpeed: GalleryAutoScrollSpeed;
  onChangeGalleryAutoScrollSpeed: (v: GalleryAutoScrollSpeed) => void;
  galleryPageSize: GalleryPageSize;
  onChangeGalleryPageSize: (v: GalleryPageSize) => void;
}

export default function GallerySection({
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
}: GallerySectionProps) {
  return (
    <>
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
            aria-label="最小画像サイズ"
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
            label: GALLERY_AUTO_SCROLL_LABELS[v],
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

      <SettingRow label="1ページの件数">
        <SegmentGroup
          options={GALLERY_PAGE_SIZE_CYCLE.map((v) => ({
            value: v,
            label: GALLERY_PAGE_SIZE_LABELS[v],
          }))}
          value={galleryPageSize}
          onChange={onChangeGalleryPageSize}
          ariaLabel="1 ページの記事件数"
        />
      </SettingRow>
      <p className="text-[11px] text-text-muted pl-28 -mt-2">
        一度に表示する記事の件数ですわ。多くするとスクロールでまとめて読めますが、初回描画が重くなりますの。
      </p>
    </>
  );
}
