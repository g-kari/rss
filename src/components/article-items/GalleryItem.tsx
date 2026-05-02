"use client";

import { memo, useContext } from "react";
import { timeAgo, highlightText } from "../../lib/article-utils";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  FilterableGalleryImage,
  type ArticleItemProps,
  type GalleryItemExtraProps,
} from "./shared";

export const GalleryArticleItem = memo(function GalleryArticleItem({
  article,
  isRead,
  isBookmarked,
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
  prefetchedImages,
  galleryMinImagePx = 0,
  isFetchFailed,
  onRetry,
}: Omit<ArticleItemProps, "index" | "isDeleting"> & GalleryItemExtraProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  const hasMultipleImages = !!prefetchedImages && prefetchedImages.length > 0;
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group relative cursor-pointer rounded-lg overflow-hidden transition-all duration-200 ${
        isNew ? "animate-fade-up" : ""
      } border ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
    >
      {hasMultipleImages ? (
        <div className="flex flex-col">
          {galleryMinImagePx > 0
            ? prefetchedImages.map((src, i) => (
                <FilterableGalleryImage key={`${src}-${i}`} src={src} minPx={galleryMinImagePx} />
              ))
            : prefetchedImages.map((src, i) => (
                <ArticleThumbnail
                  key={`${src}-${i}`}
                  thumb={src}
                  className="w-full h-auto object-cover bg-surface-subtle"
                />
              ))}
        </div>
      ) : isFetchFailed && thumb ? (
        <div className="relative">
          <ArticleThumbnail
            thumb={thumb}
            className="w-full h-auto object-cover bg-surface-subtle"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-surface-base/80 backdrop-blur-sm hover:bg-ink hover:text-ink-text text-[10px] text-text-muted transition-colors duration-150"
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                再取得
              </button>
            )}
          </div>
        </div>
      ) : isFetchFailed ? (
        <div className="w-full aspect-square bg-surface-subtle flex flex-col items-center justify-center gap-2">
          <svg
            className="w-5 h-5 text-text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span className="text-[10px] text-text-muted">取得失敗</span>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-surface-hover hover:bg-ink hover:text-ink-text text-[10px] text-text-default transition-colors duration-150"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              再取得
            </button>
          )}
        </div>
      ) : thumb ? (
        <ArticleThumbnail thumb={thumb} className="w-full h-auto object-cover bg-surface-subtle" />
      ) : (
        <div className="w-full aspect-square bg-surface-subtle flex items-center justify-center">
          <span className="text-[10px] text-text-faint tracking-[0.1em] uppercase">No image</span>
        </div>
      )}
      <div className="p-2.5">
        {showFeedName && feedName && (
          <span className="text-[10px] text-text-faint tracking-[0.06em] uppercase block truncate">
            {feedName}
          </span>
        )}
        <h3
          className={`text-[12px] leading-snug line-clamp-3 mt-0.5 ${
            isRead ? "text-text-muted" : "text-text-strong"
          }`}
        >
          {highlightText(article.title || "(タイトルなし)", query)}
        </h3>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] text-text-faint flex-shrink-0">
              {timeAgo(article.publishedAt)}
            </span>
            {duplicateFeedNames && duplicateFeedNames.length > 0 && (
              <DuplicateBadge feedNames={duplicateFeedNames} />
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasNote && (
              <NoteIcon className="text-amber-400 group-hover:opacity-0 transition-opacity duration-150" />
            )}
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dot group-hover:opacity-0 transition-opacity duration-150" />
            )}
            <ArticleActions
              size="sm"
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
