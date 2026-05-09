"use client";

import type { Virtualizer } from "@tanstack/react-virtual";
import type { Layout } from "@/types";
import { CompactArticleItem, ListArticleItem } from "@/components/ArticleItems";
import type { FlatItem, ResolveItemProps } from "./types";

interface Props {
  items: FlatItem[];
  layout: Extract<Layout, "compact" | "list">;
  deletingIds: Set<string>;
  newIds: Set<string>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  resolveItemProps: ResolveItemProps;
}

/**
 * compact / list レイアウトのボディ。日付ヘッダーと記事を仮想化された
 * フラットリストとして描画する (#651 Step 3)。
 */
export default function CompactListBody({
  items,
  layout,
  deletingIds,
  newIds,
  virtualizer,
  resolveItemProps,
}: Props) {
  if (items.length === 0) return null;
  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((vItem) => {
        const item = items[vItem.index];
        if (!item) return null;
        return (
          <div
            key={vItem.key}
            data-index={vItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vItem.start}px)`,
              transition:
                deletingIds.size > 0 || newIds.size > 0 ? "transform 0.2s ease" : undefined,
            }}
          >
            {item.type === "header" ? (
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                  {item.label}
                </span>
              </div>
            ) : layout === "compact" ? (
              <CompactArticleItem
                {...resolveItemProps(
                  item.article,
                  item.articleIndex,
                  deletingIds.has(item.article.id),
                  newIds.has(item.article.id),
                )}
              />
            ) : (
              <ListArticleItem
                {...resolveItemProps(
                  item.article,
                  item.articleIndex,
                  deletingIds.has(item.article.id),
                  newIds.has(item.article.id),
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
