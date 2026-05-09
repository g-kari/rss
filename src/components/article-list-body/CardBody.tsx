"use client";

import type { Virtualizer } from "@tanstack/react-virtual";
import type { Article } from "@/types";
import { CardArticleItem } from "@/components/ArticleItems";
import type { ResolveItemProps } from "./types";

interface Props {
  rows: Article[][];
  deletingIds: Set<string>;
  newIds: Set<string>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  resolveItemProps: ResolveItemProps;
}

/**
 * card レイアウトのボディ。2 列グリッドの行単位で仮想化する (#651 Step 3)。
 */
export default function CardBody({
  rows,
  deletingIds,
  newIds,
  virtualizer,
  resolveItemProps,
}: Props) {
  if (rows.length === 0) return null;
  return (
    <div style={{ height: virtualizer.getTotalSize() + 16, position: "relative" }}>
      {virtualizer.getVirtualItems().map((vItem) => {
        const row = rows[vItem.index];
        if (!row) return null;
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
              padding: "4px 8px",
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {row.map((a, ri) => (
                <CardArticleItem
                  key={a.id}
                  {...resolveItemProps(
                    a,
                    vItem.index * 2 + ri,
                    deletingIds.has(a.id),
                    newIds.has(a.id),
                  )}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
