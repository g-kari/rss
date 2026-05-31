"use client";

import {
  memo,
  useMemo,
  useCallback,
  useContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { timeAgo } from "../../lib/article-utils";
import { highlightText } from "../../lib/article-ui-helpers";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { BulkSelectionCtx } from "../../contexts/BulkSelectionContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  ReadingTimeBadge,
  handleArticleContextMenu,
  handleArticleKeyDown,
  type ArticleItemProps,
} from "./shared";

export const CardArticleItem = memo(function CardArticleItem({
  article,
  index,
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
  totalCount,
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  onToggleReadingList,
  onContextMenu,
}: ArticleItemProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  const bulkIds = useContext(BulkSelectionCtx);
  const isBulkSelected = useMemo(() => bulkIds.has(article.id), [bulkIds, article.id]);
  // 共通ハンドラを shared から取得 (重複定義 → import 統一、refactor cycle)。
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => handleArticleKeyDown(article, onSelectArticle)(e),
    [article, onSelectArticle],
  );
  const handleContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => handleArticleContextMenu(article, onContextMenu)(e),
    [article, onContextMenu],
  );
  const timeAgoText = useMemo(() => timeAgo(article.publishedAt), [article.publishedAt]);
  return (
    <div
      role="article"
      aria-setsize={totalCount ?? -1}
      aria-posinset={index + 1}
      aria-labelledby={`article-title-${article.id}`}
      aria-describedby={`article-hint-${article.id}`}
      tabIndex={isSelected ? 0 : -1}
      id={`article-${article.id}`}
      onClick={(e) => onSelectArticle(article, e)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col cursor-pointer rounded-lg border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${isBulkSelected ? "ring-2 ring-ink ring-offset-1" : ""} ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
      style={isNew ? { animationDelay: `${Math.min(index, 20) * 25}ms` } : undefined}
    >
      <span id={`article-hint-${article.id}`} className="sr-only">
        Enterで記事を開く
      </span>
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
          id={`article-title-${article.id}`}
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
            <time
              dateTime={article.publishedAt ?? undefined}
              className="text-[10px] text-text-faint flex-shrink-0"
            >
              {timeAgoText}
            </time>
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
            className="absolute flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto max-md:opacity-100 max-md:pointer-events-auto right-2.5 bottom-2.5"
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
  );
});
