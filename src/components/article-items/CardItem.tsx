"use client";

import { memo, useCallback, useContext } from "react";
import { timeAgo, highlightText } from "../../lib/article-utils";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  ReadingTimeBadge,
  type ArticleItemProps,
} from "./shared";

export const CardArticleItem = memo(function CardArticleItem({
  article,
  index,
  isRead,
  isBookmarked,
  isDeleting,
  isNew,
  hasNote,
  feedName,
  thumb,
  showFeedName,
  query,
  duplicateFeedNames,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
}: ArticleItemProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectArticle(article);
      }
    },
    [article, onSelectArticle],
  );
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col cursor-pointer rounded-lg border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
      style={isNew ? { animationDelay: `${Math.min(index, 20) * 25}ms` } : undefined}
    >
      {thumb && (
        <ArticleThumbnail
          thumb={thumb}
          className="w-full aspect-video object-contain bg-surface-subtle flex-shrink-0"
        />
      )}
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        {showFeedName && feedName && (
          <span className="text-[10px] text-text-faint truncate tracking-[0.04em]">{feedName}</span>
        )}
        <h3
          className={`text-[12px] leading-snug line-clamp-2 ${
            isRead ? "text-text-muted font-normal" : "text-text-strong font-medium"
          }`}
        >
          {highlightText(article.title || "(タイトルなし)", query)}
        </h3>
        {article.summary && !thumb && (
          <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
            {highlightText(article.summary, query)}
          </p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-text-faint flex-shrink-0">
              {timeAgo(article.publishedAt)}
            </span>
            {article.author && (
              <span className="text-[10px] text-text-faint truncate">{article.author}</span>
            )}
            <ReadingTimeBadge
              article={article}
              className="text-[10px] text-text-faint flex-shrink-0"
            />
            {duplicateFeedNames && duplicateFeedNames.length > 0 && (
              <DuplicateBadge feedNames={duplicateFeedNames} />
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasNote && (
              <NoteIcon className="text-amber-400 [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-150" />
            )}
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dot [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-150" />
            )}
          </div>
          <ArticleActions
            size="sm"
            className="absolute flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto right-2.5 bottom-2.5"
            isRead={isRead}
            isBookmarked={isBookmarked}
            onToggleRead={() => onToggleRead(article.id)}
            onToggleBookmark={() => onToggleBookmark(article.id)}
          />
        </div>
      </div>
    </div>
  );
});
