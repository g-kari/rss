import React from "react";
import type { Article } from "../../types";
import { ChevronSmall } from "./icons";

interface Props {
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
}

export default function ArticleNavigation({
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
}: Props) {
  if (!prevArticle && !nextArticle) return null;
  return (
    <div
      data-print="hide"
      className="mt-12 pt-6 border-t border-border-subtle flex items-stretch gap-3"
    >
      {prevArticle ? (
        <button
          onClick={onSelectPrev}
          aria-label={`前の記事: ${prevArticle.title}`}
          className="flex-1 text-left px-4 py-3 rounded-lg border border-border-default hover:border-text-faint hover:bg-surface-subtle transition-all duration-200 group"
        >
          <span className="flex items-center gap-1 text-[10px] tracking-[0.08em] uppercase text-text-faint mb-1.5">
            <ChevronSmall direction="left" />
            前の記事
          </span>
          <span className="text-[12px] leading-snug text-text-muted group-hover:text-text-strong transition-colors duration-200 line-clamp-2">
            {prevArticle.title}
          </span>
        </button>
      ) : (
        <div className="flex-1" />
      )}
      {nextArticle ? (
        <button
          onClick={onSelectNext}
          aria-label={`次の記事: ${nextArticle.title}`}
          className="flex-1 text-right px-4 py-3 rounded-lg border border-border-default hover:border-text-faint hover:bg-surface-subtle transition-all duration-200 group"
        >
          <span className="flex items-center justify-end gap-1 text-[10px] tracking-[0.08em] uppercase text-text-faint mb-1.5">
            次の記事
            <ChevronSmall direction="right" />
          </span>
          <span className="text-[12px] leading-snug text-text-muted group-hover:text-text-strong transition-colors duration-200 line-clamp-2">
            {nextArticle.title}
          </span>
        </button>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}
