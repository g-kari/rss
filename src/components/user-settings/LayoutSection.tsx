"use client";

import type { ContentWidth, LineHeight } from "../../lib/reader-settings";
import {
  LINE_HEIGHT_CYCLE,
  LINE_HEIGHT_LABELS,
  CONTENT_WIDTH_CYCLE,
  CONTENT_WIDTH_LABELS,
} from "../../lib/reader-settings";
import { SettingRow, SegmentGroup } from "./shared";

interface LayoutSectionProps {
  lineHeight: LineHeight;
  onChangeLineHeight: (v: LineHeight) => void;
  contentWidth: ContentWidth;
  onChangeContentWidth: (v: ContentWidth) => void;
  textJustify: boolean;
  onChangeTextJustify: (v: boolean) => void;
}

export default function LayoutSection({
  lineHeight,
  onChangeLineHeight,
  contentWidth,
  onChangeContentWidth,
  textJustify,
  onChangeTextJustify,
}: LayoutSectionProps) {
  return (
    <>
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
    </>
  );
}
