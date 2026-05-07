"use client";

import { memo, useCallback, useContext } from "react";
import { timeAgo } from "../../lib/article-utils";
import { highlightText } from "../../lib/article-ui-helpers";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  ReadingTimeBadge,
  type ArticleItemProps,
} from "./shared";

export const ListArticleItem = memo(function ListArticleItem({
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
  totalCount,
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
      role="article"
      aria-setsize={totalCount ?? -1}
      aria-posinset={index + 1}
      tabIndex={isSelected ? 0 : -1}
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      onKeyDown={handleKeyDown}
      className={`group flex items-start gap-2.5 px-4 py-3 cursor-pointer border-b border-border-subtle transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${
        isSelected
          ? "bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]"
          : "hover:bg-surface-hover"
      }`}
      style={isNew ? { animationDelay: `${Math.min(index, 20) * 25}ms` } : undefined}
    >
      <div className="flex-1 min-w-0">
        {showFeedName && feedName && (
          <span className="text-[10px] text-text-faint tracking-[0.04em] mb-0.5 block truncate">
            {feedName}
          </span>
        )}
        <h3
          className={`text-[13px] leading-snug line-clamp-2 mb-1 transition-colors duration-200 ${
            isRead ? "text-text-muted font-normal" : "text-text-strong font-medium"
          }`}
        >
          {highlightText(article.title || "(タイトルなし)", query)}
        </h3>
        {article.summary && (
          <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed mb-1">
            {highlightText(article.summary, query)}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-faint">{timeAgo(article.publishedAt)}</span>
          {article.author && (
            <span className="text-[11px] text-text-faint truncate max-w-[100px]">
              {article.author}
            </span>
          )}
          <ReadingTimeBadge article={article} />
          {duplicateFeedNames && duplicateFeedNames.length > 0 && (
            <DuplicateBadge feedNames={duplicateFeedNames} />
          )}
          {hasNote && <NoteIcon className="text-amber-400 flex-shrink-0" />}
          {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {thumb && <ArticleThumbnail thumb={thumb} className="w-14 h-14 object-cover rounded" />}
        <ArticleActions
          className="flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto max-md:opacity-100 max-md:pointer-events-auto"
          isRead={isRead}
          isBookmarked={isBookmarked}
          onToggleRead={() => onToggleRead(article.id)}
          onToggleBookmark={() => onToggleBookmark(article.id)}
        />
      </div>
    </div>
  );
});
