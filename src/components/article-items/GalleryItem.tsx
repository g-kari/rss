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
import { selectGalleryDisplayMode, selectGalleryImages } from "../../lib/gallery-display";
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
  forcedImageSrc,
  forcedImageKey,
  onSelectImage,
  onHideForcedImage,
}: Omit<ArticleItemProps, "index" | "isDeleting"> & GalleryItemExtraProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  // Phase 1: forcedImageSrc が指定されたら、prefetched / thumb fallback を無視して
  // この 1 枚だけ表示する (画像/動画 view の 1 記事 N 画像分解時)。
  // forcedImageSrc 未指定 → 従来通り selectGalleryImages で prefetched/thumb/none を選択。
  const { images: displayImages, source: imageSource } = useMemo(() => {
    if (forcedImageSrc) {
      return { images: [forcedImageSrc], source: "prefetched" as const };
    }
    return selectGalleryImages(prefetchedImages, thumb);
  }, [forcedImageSrc, prefetchedImages, thumb]);
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
    // discriminated union (#770): caller の型レベル契約で forcedImageSrc=string と
    // forcedImageKey/onHideForcedImage の同時提供が保証される。
    // 但し destructure 後は TS の narrow が伝播しないため、3 値 guard は実行時 safety として残す
    // (caller 漏れの将来再発は型エラーで未然に防止済)。
    if (forcedImageSrc && forcedImageKey && onHideForcedImage) {
      onHideForcedImage(forcedImageKey);
    }
  }, [forcedImageSrc, forcedImageKey, onHideForcedImage]);
  const useFilteredPath = imageSource === "prefetched" && galleryMinImagePx > 0;
  const allFiltered = useFilteredPath && hiddenCount > 0 && hiddenCount >= displayImages.length;
  // forcedImageSrc 指定 (= 1 記事 N 画像分解、Phase 1) で min-px フィルタにより hidden に
  // なった場合は thumb fallback せずカード自体を非表示にする (小さい画像の fallback 不要)。
  const isForcedHidden = !!forcedImageSrc && allFiltered;
  // 従来 1 記事 1 カード時の thumb fallback / No Image プレースホルダ (forcedImageSrc 時は skip)
  const fallbackToThumb = allFiltered && !!thumb && !forcedImageSrc;
  const fallbackToNoImage = allFiltered && !thumb && !forcedImageSrc;
  // Phase 1: forcedImageSrc + onSelectImage が両方あれば画像ライトボックスを開く、
  // 無ければ従来通り記事詳細を開く。
  const handleClick = useCallback(() => {
    if (forcedImageSrc && onSelectImage) {
      onSelectImage(forcedImageSrc, article);
    } else {
      onSelectArticle(article);
    }
  }, [article, forcedImageSrc, onSelectImage, onSelectArticle]);
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );
  // #819: 4-5 段の三項 chain を平坦化。selectGalleryDisplayMode で mode を決定し、
  // switch (mode) で 1 段の分岐に集約。各 case の JSX は元コードと完全同一。
  const displayMode = selectGalleryDisplayMode({
    isFetchFailed: !!isFetchFailed,
    isForcedHidden,
    fallbackToThumb,
    fallbackToNoImage,
    imageSource,
    thumb,
  });

  if (displayMode === "forced-hidden") {
    // 親 (ArticleList) で `onHideForcedImage` 通知後に items から除外されるが、
    // 通知から filter 反映までの 1 フレームの隙間で空 div を返して点滅を防ぐ。
    return <div className="hidden" aria-hidden="true" />;
  }

  const renderImage = () => {
    switch (displayMode) {
      case "failed-with-thumb":
        // 画像展開失敗時でも、取得済みの OGP/サムネがあれば背景に表示しつつエラー UI を重ねる
        return (
          <div className="relative">
            <ArticleThumbnail
              thumb={thumb!}
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
        );
      case "failed-no-thumb":
        return (
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
        );
      case "fallback-thumb":
        // #671: prefetched 全画像が minPx 未満で hidden → thumb (OGP/サムネ) に fallback
        return (
          <div className="flex flex-col relative">
            <ArticleThumbnail
              thumb={thumb!}
              className="w-full h-auto object-cover bg-surface-subtle"
            />
          </div>
        );
      case "fallback-no-image":
        // #671: prefetched 全画像が hidden + thumb もない → No Image プレースホルダ
        return (
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
        );
      case "gallery":
        return (
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
        );
      case "none":
        return (
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
        );
    }
  };

  return (
    <div
      role="article"
      tabIndex={isSelected ? 0 : -1}
      id={`article-${article.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`group relative cursor-pointer rounded-lg overflow-hidden transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        isNew ? "animate-fade-up" : ""
      } border ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
    >
      {renderImage()}
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
