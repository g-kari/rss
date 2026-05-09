"use client";

import type { Virtualizer } from "@tanstack/react-virtual";
import type { Article } from "@/types";
import { CompactArticleItem, MagazineFeaturedArticleItem } from "@/components/ArticleItems";
import type { ResolveItemProps } from "./types";
import { VirtualRow } from "./VirtualRow";

interface Props {
  items: Article[];
  deletingIds: Set<string>;
  newIds: Set<string>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  resolveItemProps: ResolveItemProps;
}

/**
 * magazine レイアウトのボディ。先頭をフィーチャー記事、残りを仮想化された
 * compact リストとして表示する (#651 Step 3)。
 */
export default function MagazineBody({
  items,
  deletingIds,
  newIds,
  virtualizer,
  resolveItemProps,
}: Props) {
  if (items.length === 0) return null;
  const featured = items[0];
  return (
    <>
      <div className="p-2">
        <MagazineFeaturedArticleItem
          {...resolveItemProps(featured, 0, deletingIds.has(featured.id), newIds.has(featured.id))}
        />
      </div>
      {items.length > 1 && (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const a = items[vItem.index + 1];
            if (!a) return null;
            return (
              <VirtualRow
                key={vItem.key}
                vItem={vItem}
                measureRef={virtualizer.measureElement}
                animating={deletingIds.size > 0 || newIds.size > 0}
              >
                <CompactArticleItem
                  {...resolveItemProps(a, vItem.index + 1, deletingIds.has(a.id), newIds.has(a.id))}
                />
              </VirtualRow>
            );
          })}
        </div>
      )}
    </>
  );
}
