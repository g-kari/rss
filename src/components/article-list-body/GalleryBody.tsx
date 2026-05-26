"use client";

import type { Article } from "@/types";
import type { GalleryEntry } from "@/lib/gallery-explode";
import GalleryMasonry from "@/components/GalleryMasonry";
import {
  getGalleryCardWidth,
  type GalleryCardSize,
  type GalleryColumns,
} from "@/lib/reader-settings";
import {
  GalleryItemCtx,
  type GalleryItemContextValue,
  galleryItemKey,
  galleryEntryItemKey,
} from "./gallery-context";
import GalleryCardRenderer from "./GalleryCardRenderer";

interface Props {
  /**
   * Article[] (従来 1 article 1 card) または GalleryEntry[] (Phase 1 で 1 記事 N 画像分解) のいずれか。
   * GalleryCardRenderer 側で型ガードして両対応。
   */
  items: Article[] | GalleryEntry[];
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

function isEntryArray(items: Article[] | GalleryEntry[]): items is GalleryEntry[] {
  // discriminated union (#769): _type field で Article との判別を行う。
  // 旧実装は `article` field の存在チェックだったが、Article が将来 `article` 名の field を
  // 持つと誤判定するリスクがあったため、明示的な discriminant 文字列に切替。
  return items.length > 0 && (items[0] as GalleryEntry)._type === "gallery-entry";
}

/**
 * gallery レイアウトのボディ。自前 virtualizer (GalleryMasonrySelf) と
 * Provider のラッピングを担う。
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
  const columns = listFocusMode
    ? galleryColumnsFocus === "auto"
      ? galleryColumns === "auto"
        ? 6
        : Number(galleryColumns)
      : Number(galleryColumnsFocus)
    : galleryColumns === "auto"
      ? null
      : Number(galleryColumns);
  // 双子 JSX (GalleryEntry[] / Article[]) は GalleryMasonry の generic <T> を items 型で確定する
  // ために維持する。`Article[] | GalleryEntry[]` → `(Article | GalleryEntry)[]` への union widen は
  // TypeScript で自動推論されず、JSX 統合は型 cast が増えて却って読みづらくなる (#769 で検討の結果保留)。
  const useEntries = isEntryArray(items);
  return (
    <div className="p-2 mx-auto">
      <GalleryItemCtx.Provider value={contextValue}>
        {useEntries ? (
          <GalleryMasonry
            items={items as GalleryEntry[]}
            scrollElement={scrollElement}
            columnWidth={getGalleryCardWidth(galleryCardSize)}
            columnGutter={12}
            overscanBy={12}
            columns={columns}
            itemKey={galleryEntryItemKey}
            render={GalleryCardRenderer}
          />
        ) : (
          <GalleryMasonry
            items={items as Article[]}
            scrollElement={scrollElement}
            columnWidth={getGalleryCardWidth(galleryCardSize)}
            columnGutter={12}
            overscanBy={12}
            columns={columns}
            itemKey={galleryItemKey}
            render={GalleryCardRenderer}
          />
        )}
      </GalleryItemCtx.Provider>
    </div>
  );
}
