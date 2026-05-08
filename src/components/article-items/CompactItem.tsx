"use client";

import { memo, useCallback, useContext } from "react";
import { timeAgo } from "../../lib/article-utils";
import { highlightText } from "../../lib/article-ui-helpers";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import { ArticleActions, DuplicateBadge, type ArticleItemProps } from "./shared";

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
  totalCount,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onContextMenu,
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
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextMenu) return;
      e.preventDefault();
      onContextMenu(article, e.clientX, e.clientY);
    },
    [article, onContextMenu],
  );
  return (
    <div
      role="article"
      aria-setsize={totalCount ?? -1}
      aria-posinset={index + 1}
      tabIndex={isSelected ? 0 : -1}
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      className={`group flex items-center gap-2 px-4 py-1.5 cursor-pointer border-b border-border-subtle transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
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
        className="flex items-center gap-0.5 flex-shrink-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto max-md:opacity-100 max-md:pointer-events-auto"
        isRead={isRead}
        isBookmarked={isBookmarked}
        onToggleRead={() => onToggleRead(article.id)}
        onToggleBookmark={() => onToggleBookmark(article.id)}
      />
    </div>
  );
});
