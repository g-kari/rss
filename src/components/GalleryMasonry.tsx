"use client";

import type { ComponentType } from "react";
import GalleryMasonrySelf from "./GalleryMasonrySelf";

export interface GalleryMasonryProps<T> {
  items: T[];
  scrollElement: HTMLElement | null;
  render: ComponentType<{ data: T; index: number; width: number }>;
  itemKey?: (data: T, index: number) => string | number;
  columnWidth?: number;
  columnGutter?: number;
  overscanBy?: number;
  columns?: number | null;
}

/**
 * #773 Phase 3 (#822): masonic 完全削除済み、自前 virtualizer (`GalleryMasonrySelf`) の thin wrapper。
 *
 * Phase 0-2c で `masonic` ↔ 自前 virtualizer dual implementation を維持していたが、
 * Phase 2c のユーザー検証完了後、Phase 3 でテストモード設定 + `<GalleryMasonryMasonic>` 経路 +
 * `masonic` dependency を削除し default ON 化。本ファイルは外部の `<GalleryMasonry>` 参照
 * (caller 側) との後方互換のために残置している thin wrapper。
 *
 * 既存 caller の import path / props 互換は維持。GalleryMasonrySelf を直接 import する形に
 * 段階移行可能 (ただし caller 全件移行後の本ファイル削除は別 Issue で対応)。
 */
export default function GalleryMasonry<T>(props: GalleryMasonryProps<T>) {
  return <GalleryMasonrySelf {...props} />;
}
