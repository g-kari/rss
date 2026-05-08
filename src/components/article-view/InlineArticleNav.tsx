import React from "react";
import type { Article } from "../../types";
import { ChevronSmall } from "./icons";

interface Props {
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

export default function InlineArticleNav({
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
}: Props) {
  return (
    <div
      className="group relative flex items-center gap-3 h-[52px] mb-3 select-none cursor-pointer"
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      role="navigation"
      aria-label="前後の記事へ移動 — 左半分クリックで前、右半分クリックで次"
    >
      <div className="flex-1 overflow-hidden flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {prevArticle && onSelectPrev && (
          <>
            <ChevronSmall direction="left" />
            <span className="text-[11px] text-text-faint truncate">{prevArticle.title}</span>
          </>
        )}
      </div>
      <div className="absolute inset-x-0 top-1/2 border-t border-border-subtle pointer-events-none" />
      <div className="flex-1 overflow-hidden flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {nextArticle && onSelectNext && (
          <>
            <span className="text-[11px] text-text-faint truncate">{nextArticle.title}</span>
            <ChevronSmall direction="right" />
          </>
        )}
      </div>
    </div>
  );
}
