"use client";

import { memo, type ReactNode } from "react";
import type { Feed } from "../../types";
import { formatCount } from "../../lib/article-utils";

interface Props {
  categoryGroups: [string, Feed[]][];
  uncategorizedFeeds: Feed[];
  collapsedCategories: Set<string>;
  unreadByFeed: Map<string, number>;
  globalOffset: number;
  onToggleCollapseCategory?: (category: string) => void;
  renderFeed: (feed: Feed, isPinned: boolean, globalIdx: number) => ReactNode;
}

function CategorySectionImpl({
  categoryGroups,
  uncategorizedFeeds,
  collapsedCategories,
  unreadByFeed,
  globalOffset,
  onToggleCollapseCategory,
  renderFeed,
}: Props) {
  let offset = globalOffset;
  const elements: ReactNode[] = [];

  for (const [cat, catFeeds] of categoryGroups) {
    const isCollapsed = collapsedCategories.has(cat);
    const catUnread = catFeeds.reduce((sum, f) => sum + (unreadByFeed.get(f.id) ?? 0), 0);
    const catContentId = `category-${cat}-content`;
    elements.push(
      <button
        key={`cat-header-${cat}`}
        className="w-full px-4 pt-2.5 pb-0.5 flex items-center gap-1 group"
        onClick={() => onToggleCollapseCategory?.(cat)}
        title={isCollapsed ? "展開" : "折りたたむ"}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? `${cat} を展開` : `${cat} を折りたたむ`}
        aria-controls={catContentId}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`flex-shrink-0 text-text-muted transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5 7L1 3h8L5 7z" />
        </svg>
        <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-text-muted group-hover:text-text-default transition-colors">
          {cat}
        </span>
        {isCollapsed && (
          <span
            className={`ml-auto text-[10px] tabular-nums ${catUnread > 0 ? "text-text-muted" : "text-text-faint"}`}
          >
            {catUnread > 0 ? formatCount(catUnread) : catFeeds.length}
          </span>
        )}
      </button>,
    );
    elements.push(
      <div key={`cat-content-${cat}`} id={catContentId} hidden={isCollapsed || undefined}>
        {catFeeds.map((feed, i) => renderFeed(feed, false, offset + i))}
      </div>,
    );
    offset += catFeeds.length;
  }

  if (categoryGroups.length > 0 && uncategorizedFeeds.length > 0) {
    elements.push(
      <div key="cat-separator" className="mx-4 my-1.5">
        <div className="border-t border-border-subtle" />
      </div>,
    );
  }

  uncategorizedFeeds.forEach((feed, i) => {
    elements.push(renderFeed(feed, false, offset + i));
  });

  return <>{elements}</>;
}

/**
 * #758: memo 化で props shallow equal なら re-render skip。
 * `useArticleUnreadStats` の構造的等価性ガードで `unreadByFeed` Map が内容変化なし時に
 * 同 reference を返すため、`readIds` 連打などで親が re-render しても本コンポーネント
 * は skip 可能になる。
 */
const CategorySection = memo(CategorySectionImpl);
export default CategorySection;
