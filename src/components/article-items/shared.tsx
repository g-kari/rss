"use client";

import { memo, useCallback, useState } from "react";
import type { Article } from "../../types";
import { readingTime } from "../../lib/article-utils";
import { buildImageProxyUrl } from "../../lib/image-proxy-url";

// ── 共通 Props ──────────────────────────────────────────────────────────

export interface ArticleItemProps {
  article: Article;
  index: number;
  isRead: boolean;
  isBookmarked: boolean;
  /** 削除アニメーション中（既読フィルタなどで visible から抜けた直後の猶予期間） */
  isDeleting?: boolean;
  /** 新規追加アニメーション対象 */
  isNew?: boolean;
  hasNote: boolean;
  feedName: string;
  thumb: string | undefined;
  showFeedName: boolean;
  query: string;
  /** 同一リンクの重複記事があるフィード名一覧（重複検出時のみ） */
  duplicateFeedNames?: string[];
  // 親の安定参照をそのまま渡す（子側でクロージャを生成してメモ比較を壊さない）
  onSelectArticle: (a: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}

// ── サブコンポーネント ──────────────────────────────────────────────────

export interface ArticleActionsProps {
  isRead: boolean;
  isBookmarked: boolean;
  size?: "sm" | "md";
  className?: string;
  onToggleRead: () => void;
  onToggleBookmark: () => void;
}

export function ArticleActions({
  isRead,
  isBookmarked,
  size = "md",
  className = "flex items-center gap-0.5",
  onToggleRead,
  onToggleBookmark,
}: ArticleActionsProps) {
  const btn =
    size === "sm"
      ? "w-5 h-5 md:w-5 md:h-5 max-md:min-w-[44px] max-md:min-h-[44px]"
      : "w-6 h-6 md:w-6 md:h-6 max-md:min-w-[44px] max-md:min-h-[44px]";
  const icon = size === "sm" ? 10 : 12;
  const bicon = size === "sm" ? { w: 9, h: 11 } : { w: 11, h: 13 };
  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggleRead}
        title={isRead ? "未読にする" : "既読にする"}
        className={`${btn} flex items-center justify-center rounded text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-150`}
      >
        {isRead ? (
          <svg
            width={icon}
            height={icon}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="6" r="4.5" />
          </svg>
        ) : (
          <svg width={icon} height={icon} viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="6" r="3.5" />
          </svg>
        )}
      </button>
      <button
        onClick={onToggleBookmark}
        title={isBookmarked ? "ブックマーク解除" : "ブックマーク"}
        className={`${btn} flex items-center justify-center rounded transition-all duration-150 ${
          isBookmarked
            ? "text-bookmark"
            : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
        }`}
      >
        <svg
          width={bicon.w}
          height={bicon.h}
          viewBox="0 0 11 13"
          fill={isBookmarked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1h9v11l-4.5-3L1 12V1z" />
        </svg>
      </button>
    </div>
  );
}

export function ReadingTimeBadge({
  article,
  className = "text-[11px] text-text-faint",
}: {
  article: Article;
  className?: string;
}) {
  const src = article.content ?? article.summary;
  const mins = src ? readingTime(src) : 0;
  return mins > 1 ? <span className={className}>約{mins}分</span> : null;
}

export function DuplicateBadge({ feedNames }: { feedNames: string[] }) {
  if (!feedNames.length) return null;
  const label = `+${feedNames.length} フィード`;
  const tooltip = feedNames.join(", ");
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] text-text-muted bg-surface-subtle rounded px-1 py-px flex-shrink-0"
      title={tooltip}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="w-3 h-3"
      >
        <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h5.5a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12.5 12H7a1.5 1.5 0 0 1-1.5-1.5v-7Z" />
        <path
          d="M3.5 5.5A1.5 1.5 0 0 0 2 7v5.5A1.5 1.5 0 0 0 3.5 14H9a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 9 5.5H3.5Z"
          opacity=".5"
        />
      </svg>
      {label}
    </span>
  );
}

export function ArticleThumbnail({ thumb, className }: { thumb: string; className: string }) {
  return (
    <img
      src={buildImageProxyUrl(thumb)}
      alt=""
      className={className}
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export interface GalleryItemExtraProps {
  /** 本文から先行取得した全画像 URL（設定時は thumb の代わりに全枚数を縦スタック表示） */
  prefetchedImages?: string[];
  /** 最小画像サイズ (px)。この値未満の naturalWidth/Height を持つ画像を非表示にする */
  galleryMinImagePx?: number;
  /** コンテンツ取得に失敗したかどうか */
  isFetchFailed?: boolean;
  /** 失敗した記事のリトライハンドラー */
  onRetry?: () => void;
}

export const FilterableGalleryImage = memo(function FilterableGalleryImage({
  src,
  minPx,
}: {
  src: string;
  minPx: number;
}) {
  const [hidden, setHidden] = useState(false);
  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (minPx > 0 && img.naturalWidth < minPx && img.naturalHeight < minPx) {
        setHidden(true);
      }
    },
    [minPx],
  );
  if (hidden) return null;
  return (
    <img
      src={buildImageProxyUrl(src)}
      alt=""
      className="w-full h-auto object-cover bg-surface-subtle"
      loading="lazy"
      onLoad={handleLoad}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
});
