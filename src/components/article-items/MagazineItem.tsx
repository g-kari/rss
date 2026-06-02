"use client";

import { memo, useMemo, useContext } from "react";
import { timeAgo } from "../../lib/article-utils";
import { highlightText } from "../../lib/article-ui-helpers";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { BulkSelectionCtx } from "../../contexts/BulkSelectionContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  ReadingProgressBar,
  ReadingTimeBadge,
  useArticleHandlers,
  type ArticleItemProps,
} from "./shared";

export const MagazineFeaturedArticleItem = memo(function MagazineFeaturedArticleItem({
  article,
  isRead,
  isBookmarked,
  isInReadingList,
  isDeleting,
  isNew,
  hasNote,
  feedName,
  thumb,
  showFeedName,
  query,
  duplicateFeedNames,
  readingProgress,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onToggleReadingList,
  onContextMenu,
}: Omit<ArticleItemProps, "index">) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  const bulkIds = useContext(BulkSelectionCtx);
  const isBulkSelected = useMemo(() => bulkIds.has(article.id), [bulkIds, article.id]);
  const { handleKeyDown, handleContextMenu } = useArticleHandlers(
    article,
    onSelectArticle,
    onContextMenu,
  );
  const timeAgoText = useMemo(() => timeAgo(article.publishedAt), [article.publishedAt]);
  return (
    <div
      role="article"
      aria-setsize={-1}
      aria-labelledby={`article-title-${article.id}`}
      aria-describedby={`article-hint-${article.id}`}
      tabIndex={isSelected ? 0 : -1}
      id={`article-${article.id}`}
      onClick={(e) => onSelectArticle(article, e)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      className={`group relative cursor-pointer border rounded-lg overflow-hidden transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${isBulkSelected ? "ring-2 ring-ink ring-offset-1" : ""} ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
    >
      <span id={`article-hint-${article.id}`} className="sr-only">
        Enterで記事を開く
      </span>
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
          id={`article-title-${article.id}`}
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
            <time
              dateTime={article.publishedAt ?? undefined}
              className="text-[11px] text-text-faint"
            >
              {timeAgoText}
            </time>
            <ReadingTimeBadge article={article} />
            {duplicateFeedNames && duplicateFeedNames.length > 0 && (
              <DuplicateBadge feedNames={duplicateFeedNames} />
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasNote && (
              <NoteIcon className="text-amber-400 [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-150" />
            )}
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dot [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-150" />
            )}
            <ArticleActions
              className="flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto max-md:opacity-100 max-md:pointer-events-auto"
              isRead={isRead}
              isBookmarked={isBookmarked}
              isInReadingList={isInReadingList}
              onToggleRead={() => onToggleRead(article.id)}
              onToggleBookmark={() => onToggleBookmark(article.id)}
              onToggleReadingList={
                onToggleReadingList ? () => onToggleReadingList(article.id) : undefined
              }
            />
          </div>
        </div>
      </div>
      {readingProgress !== null && readingProgress !== undefined && (
        <ReadingProgressBar progress={readingProgress} />
      )}
    </div>
  );
});
