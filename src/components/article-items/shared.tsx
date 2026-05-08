"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { Article } from "../../types";
import { readingTime } from "../../lib/article-utils";
import { buildImageProxyUrl } from "../../lib/image-proxy-url";

// ── 共通キーボードハンドラ ──────────────────────────────────────────────

/** Enter / Space で記事を選択する共通 onKeyDown ハンドラを生成する */
export function handleArticleKeyDown(
  article: Article,
  onSelectArticle: (a: Article) => void,
): (e: React.KeyboardEvent) => void {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectArticle(article);
    }
  };
}

// ── 共通 Props ──────────────────────────────────────────────────────────

export interface ArticleItemProps {
  article: Article;
  index: number;
  isRead: boolean;
  isBookmarked: boolean;
  /** 後で読むに登録済みかどうか（#633） */
  isInReadingList?: boolean;
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
  /** role="feed" 内の総記事数（aria-setsize 用） */
  totalCount?: number;
  // 親の安定参照をそのまま渡す（子側でクロージャを生成してメモ比較を壊さない）
  onSelectArticle: (a: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  /** 後で読むのトグル（#633、card/magazine のみホバーボタンで使用） */
  onToggleReadingList?: (id: string) => void;
  /** 右クリックメニュー（#633 A3、全レイアウトで使用、gallery は GalleryContextMenu が優先） */
  onContextMenu?: (article: Article, x: number, y: number) => void;
}

// ── サブコンポーネント ──────────────────────────────────────────────────

export interface ArticleActionsProps {
  isRead: boolean;
  isBookmarked: boolean;
  /** 後で読むに登録済みかどうか（#633、onToggleReadingList が指定されたときのみ表示） */
  isInReadingList?: boolean;
  size?: "sm" | "md";
  className?: string;
  onToggleRead: () => void;
  onToggleBookmark: () => void;
  /** 指定されたときだけ「後で読む」ボタンを表示する（#633、card/magazine のみ） */
  onToggleReadingList?: () => void;
}

export const ArticleActions = memo(function ArticleActions({
  isRead,
  isBookmarked,
  isInReadingList = false,
  size = "md",
  className = "flex items-center gap-0.5",
  onToggleRead,
  onToggleBookmark,
  onToggleReadingList,
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
        aria-label={isRead ? "未読にする" : "既読にする"}
        aria-pressed={isRead}
        className={`${btn} flex items-center justify-center rounded text-text-faint hover:text-text-muted hover:bg-surface-subtle transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ink`}
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
        aria-label={isBookmarked ? "ブックマーク解除" : "ブックマーク"}
        aria-pressed={isBookmarked}
        className={`${btn} flex items-center justify-center rounded transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
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
      {onToggleReadingList && (
        <button
          onClick={onToggleReadingList}
          title={isInReadingList ? "後で読むから解除" : "後で読む"}
          aria-label={isInReadingList ? "後で読むから解除" : "後で読む"}
          aria-pressed={isInReadingList}
          className={`${btn} flex items-center justify-center rounded transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ink ${
            isInReadingList
              ? "text-text-strong"
              : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
          }`}
        >
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
            <path d="M6 3.5v2.7L7.6 7" />
          </svg>
        </button>
      )}
    </div>
  );
});

export function ReadingTimeBadge({
  article,
  className = "text-[11px] text-text-faint",
}: {
  article: Article;
  className?: string;
}) {
  const mins = useMemo(() => {
    const src = article.content ?? article.summary;
    return src ? readingTime(src) : 0;
  }, [article.content, article.summary]);
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
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-surface-subtle`}
        aria-hidden
      >
        <svg
          className="w-6 h-6 text-text-faint"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={buildImageProxyUrl(thumb)}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
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
  /** 画像展開中（フェッチ中）かどうか */
  isExpanding?: boolean;
  /** 失敗した記事のリトライ / 未取得記事の手動展開ハンドラー */
  onRetry?: () => void;
}

/** 画像展開ボタン（ギャラリーカード内に表示） */
export const GalleryExpandButton = memo(function GalleryExpandButton({
  isExpanding,
  onClick,
  className = "",
}: {
  isExpanding: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={isExpanding}
      className={`flex items-center gap-1 px-2 py-1 max-md:min-h-[44px] rounded bg-surface-hover hover:bg-ink hover:text-ink-text text-[10px] text-text-default transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {isExpanding ? (
        <svg
          className="w-3 h-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 8-8" />
        </svg>
      ) : (
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
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
          />
        </svg>
      )}
      {isExpanding ? "取得中..." : "画像を展開"}
    </button>
  );
});

export const FilterableGalleryImage = memo(function FilterableGalleryImage({
  src,
  minPx,
}: {
  src: string;
  minPx: number;
}) {
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  // ロード前は aspect-ratio を 1/1 で仮置きして空間を予約することで、
  // 画像読み込み完了時の高さ確定による masonic 全体再配置（レイアウトシフト）
  // を緩和する (#636 症状 2)。ロード後は naturalWidth/Height から実比率に切替。
  const [aspectRatio, setAspectRatio] = useState<string>("1 / 1");
  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspectRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
      }
      if (minPx > 0 && img.naturalWidth < minPx && img.naturalHeight < minPx) {
        setHidden(true);
      }
    },
    [minPx],
  );
  if (hidden) return null;
  if (failed) {
    return (
      <div className="w-full aspect-video flex items-center justify-center bg-surface-subtle">
        <svg
          className="w-6 h-6 text-text-faint"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={buildImageProxyUrl(src)}
      alt=""
      className="w-full object-cover bg-surface-subtle"
      style={{ aspectRatio }}
      loading="lazy"
      onLoad={handleLoad}
      onError={() => setFailed(true)}
    />
  );
});
