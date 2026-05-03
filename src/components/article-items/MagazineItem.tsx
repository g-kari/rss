"use client";

import { memo, useContext } from "react";
import { timeAgo, highlightText } from "../../lib/article-utils";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  ReadingTimeBadge,
  handleArticleKeyDown,
  type ArticleItemProps,
} from "./shared";

export const MagazineFeaturedArticleItem = memo(function MagazineFeaturedArticleItem({
  article,
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
}: Omit<ArticleItemProps, "index">) {
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
      className={`group relative cursor-pointer border rounded-lg overflow-hidden transition-all duration-200 ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
    >
      {thumb && (
        <ArticleThumbnail
          thumb={thumb}
          className="w-full aspect-video object-contain bg-surface-subtle"
        />
      )}
      <div className="p-3">
        {showFeedName && feedName && (
          <span className="text-[10px] text-text-faint tracking-[0.06em] uppercase">
            {feedName}
          </span>
        )}
        <h3
          className={`text-[14px] leading-snug font-medium mt-0.5 mb-1.5 ${
            isRead ? "text-text-muted" : "text-text-strong"
          }`}
        >
          {highlightText(article.title || "(タイトルなし)", query)}
        </h3>
        {article.summary && (
          <p className="text-[12px] text-text-muted line-clamp-2 leading-relaxed mb-2">
            {highlightText(article.summary, query)}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-faint">{timeAgo(article.publishedAt)}</span>
            <ReadingTimeBadge article={article} />
            {duplicateFeedNames && duplicateFeedNames.length > 0 && (
              <DuplicateBadge feedNames={duplicateFeedNames} />
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasNote && (
              <NoteIcon className="text-amber-400 group-hover:opacity-0 transition-opacity duration-150" />
            )}
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dot group-hover:opacity-0 transition-opacity duration-150" />
            )}
            <ArticleActions
              className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto"
              isRead={isRead}
              isBookmarked={isBookmarked}
              onToggleRead={() => onToggleRead(article.id)}
              onToggleBookmark={() => onToggleBookmark(article.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
