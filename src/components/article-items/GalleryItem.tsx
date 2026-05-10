"use client";

import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { timeAgo } from "../../lib/article-utils";
import { highlightText } from "../../lib/article-ui-helpers";
import { selectGalleryImages } from "../../lib/gallery-display";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { NoteIcon } from "../article-view/icons";
import {
  ArticleActions,
  ArticleThumbnail,
  DuplicateBadge,
  FilterableGalleryImage,
  GalleryExpandButton,
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
  isExpanding,
  onRetry,
}: Omit<ArticleItemProps, "index" | "isDeleting"> & GalleryItemExtraProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  // #671: prefetched body images が空 (またはまだ undefined) で thumb があれば
  // OGP/サムネを fallback として描画する。selectGalleryImages 純粋関数で 3 分岐
  // (prefetched / thumb / none) を厳密に決定し、UI 側はこれに従う。
  const { images: displayImages, source: imageSource } = useMemo(
    () => selectGalleryImages(prefetchedImages, thumb),
    [prefetchedImages, thumb],
  );
  // 「prefetched 未取得 (undefined)」の場合のみ手動展開 (retry) ボタンを表示。
  // prefetched 完了で空配列 (= 本文に画像なし) の場合は thumb fallback で完結するため不要。
  const showRetryOverlay = onRetry && prefetchedImages === undefined;

  // #671 後追い: prefetched + minPx フィルタで全画像が hidden になると、空コンテナで
  // 「タイトルだけ表示」状態になる。FilterableGalleryImage の onHide コールバックで
  // hidden カウントを取り、displayImages 全件 hidden なら thumb / No Image fallback に切替える。
  const [hiddenCount, setHiddenCount] = useState(0);
  // displayImages 入れ替え時にカウンタリセット (記事切替・prefetch 完了時)
  useEffect(() => {
    setHiddenCount(0);
  }, [displayImages]);
  const handleImageHide = useCallback(() => {
    setHiddenCount((c) => c + 1);
  }, []);
  const useFilteredPath = imageSource === "prefetched" && galleryMinImagePx > 0;
  const allFiltered = useFilteredPath && hiddenCount > 0 && hiddenCount >= displayImages.length;
  // 全画像 hidden で thumb があれば thumb fallback、なければ No Image プレースホルダ
  const fallbackToThumb = allFiltered && !!thumb;
  const fallbackToNoImage = allFiltered && !thumb;
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
      tabIndex={isSelected ? 0 : -1}
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      onKeyDown={handleKeyDown}
      className={`group relative cursor-pointer rounded-lg overflow-hidden transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        isNew ? "animate-fade-up" : ""
      } border ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
    >
      {isFetchFailed ? (
        thumb ? (
          // 画像展開失敗時でも、取得済みの OGP/サムネがあれば背景に表示しつつエラー UI を重ねる
          <div className="relative">
            <ArticleThumbnail
              thumb={thumb}
              className="w-full h-auto object-cover bg-surface-subtle opacity-50"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-base/40 backdrop-blur-[1px]">
              <svg
                className="w-5 h-5 text-text-strong drop-shadow-sm"
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
              <span className="text-[10px] text-text-strong drop-shadow-sm">取得失敗</span>
              {onRetry && <GalleryExpandButton isExpanding={!!isExpanding} onClick={onRetry} />}
            </div>
          </div>
        ) : (
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
            {onRetry && <GalleryExpandButton isExpanding={!!isExpanding} onClick={onRetry} />}
          </div>
        )
      ) : fallbackToThumb ? (
        // #671: prefetched 全画像が minPx 未満で hidden → thumb (OGP/サムネ) に fallback
        <div className="flex flex-col relative">
          <ArticleThumbnail
            thumb={thumb!}
            className="w-full h-auto object-cover bg-surface-subtle"
          />
        </div>
      ) : fallbackToNoImage ? (
        // #671: prefetched 全画像が hidden + thumb もない → No Image プレースホルダ
        <div className="w-full aspect-square bg-surface-subtle flex flex-col items-center justify-center gap-2">
          <svg
            className="w-6 h-6 text-text-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
            />
          </svg>
          <span className="text-[10px] text-text-faint tracking-[0.1em] uppercase">No image</span>
        </div>
      ) : imageSource !== "none" ? (
        <div className="flex flex-col relative">
          {useFilteredPath
            ? displayImages.map((src, i) => (
                <FilterableGalleryImage
                  key={`${src}-${i}`}
                  src={src}
                  minPx={galleryMinImagePx}
                  onHide={handleImageHide}
                />
              ))
            : displayImages.map((src, i) => (
                <ArticleThumbnail
                  key={`${src}-${i}`}
                  thumb={src}
                  className="w-full h-auto object-cover bg-surface-subtle"
                />
              ))}
          {showRetryOverlay && (
            <div className="absolute bottom-1.5 right-1.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150">
              <GalleryExpandButton isExpanding={!!isExpanding} onClick={onRetry} />
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-square bg-surface-subtle flex flex-col items-center justify-center gap-2">
          <svg
            className="w-6 h-6 text-text-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
            />
          </svg>
          <span className="text-[10px] text-text-faint tracking-[0.1em] uppercase">No image</span>
          {onRetry && <GalleryExpandButton isExpanding={!!isExpanding} onClick={onRetry} />}
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
              <NoteIcon className="text-amber-400 [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-150" />
            )}
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dot [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-150" />
            )}
            <ArticleActions
              size="sm"
              className="flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto max-md:opacity-100 max-md:pointer-events-auto"
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
