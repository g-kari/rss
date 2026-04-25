"use client";

import { memo, useContext, type ReactNode } from "react";
import type { Article } from "../types";
import { readingTime, timeAgo } from "../lib/article-utils";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import { SelectedArticleCtx } from "../contexts/SelectedArticleContext";

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
  // 親の安定参照をそのまま渡す（子側でクロージャを生成してメモ比較を壊さない）
  onSelectArticle: (a: Article) => void;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}

// ── 共通 UI パーツ ────────────────────────────────────────────────────────

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="メモあり"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ── ユーティリティ関数 ──────────────────────────────────────────────────

/** ogImage がない場合、キャッシュ → YouTube URL の順でサムネイルを解決 */
export function resolveThumbnail(
  article: Article,
  ogpCache: Record<string, string>,
): string | undefined {
  if (article.ogImage) return article.ogImage;
  if (article.link && ogpCache[article.link]) return ogpCache[article.link];
  const yt = article.link?.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg`;
  return undefined;
}

/** 検索クエリに一致する箇所をハイライト表示（複数ワード対応） */
export function highlightText(text: string, query: string): ReactNode {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;

  // 全ワードの出現位置を収集
  const lowerText = text.toLowerCase();
  const matches: { start: number; end: number }[] = [];
  for (const term of terms) {
    let idx = lowerText.indexOf(term);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + term.length });
      idx = lowerText.indexOf(term, idx + 1);
    }
  }
  if (matches.length === 0) return text;

  // 開始位置でソートし、重複区間をマージ
  matches.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({ ...m });
    }
  }

  const parts: ReactNode[] = [];
  let pos = 0;
  let key = 0;
  for (const { start, end } of merged) {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <mark
        key={key++}
        style={{
          background: "var(--color-highlight)",
          color: "inherit",
          borderRadius: "2px",
          paddingInline: "1px",
        }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

// ── サブコンポーネント ──────────────────────────────────────────────────

interface ArticleActionsProps {
  isRead: boolean;
  isBookmarked: boolean;
  size?: "sm" | "md";
  className?: string;
  onToggleRead: () => void;
  onToggleBookmark: () => void;
}

function ArticleActions({
  isRead,
  isBookmarked,
  size = "md",
  className = "flex items-center gap-0.5",
  onToggleRead,
  onToggleBookmark,
}: ArticleActionsProps) {
  const btn = size === "sm" ? "w-5 h-5" : "w-6 h-6";
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

function ReadingTimeBadge({
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

function ArticleThumbnail({ thumb, className }: { thumb: string; className: string }) {
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

// ── compact ────────────────────────────────────────────────────────────

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
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
}: ArticleItemProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group flex items-center gap-2 px-4 py-1.5 cursor-pointer border-b border-border-subtle transition-all duration-200 ${
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
      {showFeedName && feedName && (
        <span className="text-[11px] text-text-faint truncate max-w-[80px] flex-shrink-0 group-hover:hidden">
          {feedName}
        </span>
      )}
      {hasNote && <NoteIcon className="text-amber-400 flex-shrink-0 group-hover:hidden" />}
      <span className="text-[11px] text-text-faint flex-shrink-0 group-hover:hidden">
        {timeAgo(article.publishedAt)}
      </span>
      <ArticleActions
        className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
        isRead={isRead}
        isBookmarked={isBookmarked}
        onToggleRead={() => onToggleRead(article.id)}
        onToggleBookmark={() => onToggleBookmark(article.id)}
      />
    </div>
  );
});

// ── list (デフォルト) ──────────────────────────────────────────────────

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
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
}: ArticleItemProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group flex items-start gap-2.5 px-4 py-3 cursor-pointer border-b border-border-subtle transition-all duration-200 ${
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
          {hasNote && <NoteIcon className="text-amber-400 flex-shrink-0" />}
          {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {thumb && <ArticleThumbnail thumb={thumb} className="w-14 h-14 object-cover rounded" />}
        <ArticleActions
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto"
          isRead={isRead}
          isBookmarked={isBookmarked}
          onToggleRead={() => onToggleRead(article.id)}
          onToggleBookmark={() => onToggleBookmark(article.id)}
        />
      </div>
    </div>
  );
});

// ── card ───────────────────────────────────────────────────────────────

export const CardArticleItem = memo(function CardArticleItem({
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
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
}: ArticleItemProps) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
      className={`group relative flex flex-col cursor-pointer rounded-lg border transition-all duration-200 overflow-hidden ${
        isDeleting ? "animate-fade-out" : isNew ? "animate-fade-up" : ""
      } ${
        isSelected
          ? "border-text-strong bg-surface-elevated"
          : "border-border-default hover:border-text-muted bg-surface-elevated"
      }`}
      style={isNew ? { animationDelay: `${Math.min(index, 20) * 25}ms` } : undefined}
    >
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
            <span className="text-[10px] text-text-faint flex-shrink-0">
              {timeAgo(article.publishedAt)}
            </span>
            {article.author && (
              <span className="text-[10px] text-text-faint truncate">{article.author}</span>
            )}
            <ReadingTimeBadge
              article={article}
              className="text-[10px] text-text-faint flex-shrink-0"
            />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasNote && (
              <NoteIcon className="text-amber-400 group-hover:opacity-0 transition-opacity duration-150" />
            )}
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dot group-hover:opacity-0 transition-opacity duration-150" />
            )}
          </div>
          <ArticleActions
            size="sm"
            className="absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto right-2.5 bottom-2.5"
            isRead={isRead}
            isBookmarked={isBookmarked}
            onToggleRead={() => onToggleRead(article.id)}
            onToggleBookmark={() => onToggleBookmark(article.id)}
          />
        </div>
      </div>
    </div>
  );
});

// ── magazine (フィーチャー記事) ────────────────────────────────────────

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
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
}: Omit<ArticleItemProps, "index">) {
  const selectedId = useContext(SelectedArticleCtx);
  const isSelected = selectedId === article.id;
  return (
    <div
      id={`article-${article.id}`}
      onClick={() => onSelectArticle(article)}
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

// ── gallery (Pinterest 風 masonry) ───────────────────────────────────────

interface GalleryItemExtraProps {
  /** 本文から先行取得した全画像 URL（設定時は thumb の代わりに全枚数を縦スタック表示） */
  prefetchedImages?: string[];
}

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
  onSelectArticle,
  onToggleRead,
  onToggleBookmark,
  prefetchedImages,
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
          {prefetchedImages.map((src, i) => (
            <ArticleThumbnail
              key={`${src}-${i}`}
              thumb={src}
              className="w-full h-auto object-cover bg-surface-subtle"
            />
          ))}
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
          <span className="text-[10px] text-text-faint">{timeAgo(article.publishedAt)}</span>
          <div className="flex items-center gap-1">
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
