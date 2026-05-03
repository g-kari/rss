"use client";

import { memo, useContext } from "react";
import { timeAgo, highlightText } from "../../lib/article-utils";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  DuplicateBadge,
  handleArticleKeyDown,
  type ArticleItemProps,
} from "./shared";

export const CompactArticleItem = memo(function CompactArticleItem({
  article,
  index,
  isRead,
  isBookmarked,
  isDeleting,
  isNew,
  hasNote,
  feedName,
  showFeedName,
  query,
  duplicateFeedNames,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
}: ArticleItemProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      onKeyDown={handleArticleKeyDown(article, onSelectArticle)}
      className={`group flex items-center gap-2 px-4 py-1.5 cursor-pointer border-b border-border-subtle transition-all duration-200 ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${
        isSelected
          ? "bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]"
          : "hover:bg-surface-hover"
      }`}
      style={isNew ? { animationDelay: `${Math.min(index, 20) * 15}ms` } : undefined}
    >
      <span
        className={`w-1 h-1 rounded-full flex-shrink-0 ${!isRead ? "bg-accent-dot" : "bg-transparent"}`}
      />
      <span
        className={`text-[13px] truncate flex-1 transition-colors duration-200 ${
          isRead ? "text-text-muted font-normal" : "text-text-strong font-medium"
        }`}
      >
        {highlightText(article.title || "(タイトルなし)", query)}
      </span>
      {duplicateFeedNames && duplicateFeedNames.length > 0 && (
        <DuplicateBadge feedNames={duplicateFeedNames} />
      )}
      {showFeedName && feedName && (
        <span className="text-[11px] text-text-faint truncate max-w-[80px] flex-shrink-0 [@media(hover:hover)]:group-hover:hidden">
          {feedName}
        </span>
      )}
      {hasNote && (
        <NoteIcon className="text-amber-400 flex-shrink-0 [@media(hover:hover)]:group-hover:hidden" />
      )}
      <span className="text-[11px] text-text-faint flex-shrink-0 [@media(hover:hover)]:group-hover:hidden">
        {timeAgo(article.publishedAt)}
      </span>
      <ArticleActions
        className="flex items-center gap-0.5 flex-shrink-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto"
        isRead={isRead}
        isBookmarked={isBookmarked}
        onToggleRead={() => onToggleRead(article.id)}
        onToggleBookmark={() => onToggleBookmark(article.id)}
      />
    </div>
  );
});
