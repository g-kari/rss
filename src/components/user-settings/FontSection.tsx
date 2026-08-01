"use client";

import type { FontSize, FontFamily } from "../../types";
import {
  FONT_SIZE_CYCLE,
  FONT_SIZE_LABELS,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
} from "../../lib/article-utils";
import { SettingRow, SegmentGroup, buildLabeledOptions } from "./shared";

interface FontSectionProps {
  fontSize: FontSize;
  onChangeFontSize: (v: FontSize) => void;
  fontFamily: FontFamily;
  onChangeFontFamily: (v: FontFamily) => void;
}

export default function FontSection({
  fontSize,
  onChangeFontSize,
  fontFamily,
  onChangeFontFamily,
}: FontSectionProps) {
  return (
    <>
      <SettingRow label="フォントサイズ">
        <SegmentGroup
          options={buildLabeledOptions(FONT_SIZE_CYCLE, FONT_SIZE_LABELS)}
          value={fontSize}
          onChange={onChangeFontSize}
          ariaLabel="フォントサイズ"
        />
      </SettingRow>

      <SettingRow label="フォント">
        <SegmentGroup
          options={buildLabeledOptions(FONT_FAMILY_CYCLE, FONT_FAMILY_LABELS)}
          value={fontFamily}
          onChange={onChangeFontFamily}
          ariaLabel="フォント"
        />
      </SettingRow>
    </>
  );
}
