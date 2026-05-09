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
  listFocusMode,
  contextValue,
}: Props) {
  if (items.length === 0) return null;
  return (
    <div className="p-2 mx-auto">
      <GalleryItemCtx.Provider value={contextValue}>
        <GalleryMasonry
          items={items}
          scrollElement={scrollElement}
          columnWidth={getGalleryCardWidth(galleryCardSize)}
          columnGutter={12}
          overscanBy={12}
          columns={galleryColumns === "auto" ? (listFocusMode ? 6 : null) : Number(galleryColumns)}
          itemKey={galleryItemKey}
          render={GalleryCardRenderer}
        />
      </GalleryItemCtx.Provider>
    </div>
  );
}
