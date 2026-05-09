"use client";

import type { Article } from "@/types";
import GalleryMasonry from "@/components/GalleryMasonry";
import {
  getGalleryCardWidth,
  type GalleryCardSize,
  type GalleryColumns,
} from "@/lib/reader-settings";
import { GalleryItemCtx, type GalleryItemContextValue, galleryItemKey } from "./gallery-context";
import GalleryCardRenderer from "./GalleryCardRenderer";

interface Props {
  items: Article[];
  scrollElement: HTMLDivElement | null;
  galleryCardSize: GalleryCardSize;
  galleryColumns: GalleryColumns;
  /**
   * フォーカスモード時の列数 (#666)。`"auto"` は通常列数に追従。
   * 通常列数も `"auto"` のときは従来挙動の 6 列固定にフォールバック。
   */
  galleryColumnsFocus: GalleryColumns;
  listFocusMode: boolean;
  contextValue: GalleryItemContextValue;
}

/**
 * gallery レイアウトのボディ。masonic 仮想化と Provider のラッピングを担う (#651 Step 3)。
 */
export default function GalleryBody({
  items,
  scrollElement,
  galleryCardSize,
  galleryColumns,
  galleryColumnsFocus,
  listFocusMode,
  contextValue,
}: Props) {
  if (items.length === 0) return null;
  // #666: フォーカスモード時の列数判定
  // - listFocusMode=false → 通常 (auto なら masonic 自動、それ以外は固定)
  // - listFocusMode=true:
  //   - galleryColumnsFocus="auto" → 通常列数に追従 (通常も auto なら 6 固定)
  //   - galleryColumnsFocus=固定値 → その値
  const columns = listFocusMode
    ? galleryColumnsFocus === "auto"
      ? galleryColumns === "auto"
        ? 6
        : Number(galleryColumns)
      : Number(galleryColumnsFocus)
    : galleryColumns === "auto"
      ? null
      : Number(galleryColumns);
  return (
    <div className="p-2 mx-auto">
      <GalleryItemCtx.Provider value={contextValue}>
        <GalleryMasonry
          items={items}
          scrollElement={scrollElement}
          columnWidth={getGalleryCardWidth(galleryCardSize)}
          columnGutter={12}
          overscanBy={12}
          columns={columns}
          itemKey={galleryItemKey}
          render={GalleryCardRenderer}
        />
      </GalleryItemCtx.Provider>
    </div>
  );
}
