"use client";

import type { Article } from "../../types";
import type { EmbedInfo } from "../../lib/embed-utils";
import type { EngagementAction } from "../../types";
import TagEditor from "./TagEditor";

interface Props {
  article: Article;
  onMobileBack?: () => void;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
  embedInfo: EmbedInfo | null;
  readingMins: number;
  onSetAuthorFilter: (author: string) => void;
  /** カテゴリクリック時の検索クエリ設定 (絞り込み)。未指定なら静的 span 表示 */
  onSetQuery?: (query: string) => void;
  tags?: readonly string[];
  onAddTag?: (articleId: string, tag: string) => void;
  onRemoveTag?: (articleId: string, tag: string) => void;
  feedName?: string;
}

/**
 * 記事ヘッダーのメタ情報行（戻るボタン + 日付・著者・元記事リンク・読了時間・カテゴリ・タグ）。
 *
 * ArticleHeader 親が用意する filter/category クリック処理（ローカル state 込み）を
 * props 経由で受け取る。レンダリングロジックはここに閉じる。
 */
export default function ArticleHeaderMeta({
  article,
  onMobileBack,
  onEngagement,
  embedInfo,
  readingMins,
  onSetAuthorFilter,
  onSetQuery,
  tags,
  onAddTag,
  onRemoveTag,
  feedName,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {onMobileBack && (
        <button
          onClick={onMobileBack}
          className="lg:hidden -ml-1 mr-1 p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text-strong transition-colors flex-shrink-0"
          aria-label="記事一覧に戻る"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      )}
      {feedName && (
        <span className="text-[11px] text-text-muted truncate max-w-[120px]" title={feedName}>
          {feedName}
        </span>
      )}
      {article.publishedAt && !isNaN(new Date(article.publishedAt).getTime()) && (
        <time dateTime={article.publishedAt} className="tracking-[0.04em]">
          {new Date(article.publishedAt).toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
      )}
      {article.author && (
        <button
          onClick={() => onSetAuthorFilter(article.author!)}
          title={`「${article.author}」の記事に絞り込む`}
          className="tracking-[0.04em] text-text-muted hover:text-text-default transition-colors duration-150 text-left"
        >
          {article.author}
        </button>
      )}
      {article.link && !embedInfo && (
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onEngagement?.(article.id, article.feedHash, "open_original")}
          className="text-text-muted hover:text-text-default transition-colors duration-200 tracking-[0.04em]"
        >
          元記事 ↗
        </a>
      )}
      {readingMins > 1 && (
        <span className="tracking-[0.04em] text-text-faint">約{readingMins}分</span>
      )}
      {article.categories &&
        article.categories.length > 0 &&
        // #763: タグ 1 クリックで除外フィルターに追加する機能は誤操作を招くため削除。
        // 検索クエリ絞り込みパスのみ維持し、それ以外は表示のみ (静的 span)。
        article.categories.slice(0, 5).map((cat) =>
          onSetQuery ? (
            <button
              key={cat}
              onClick={() => onSetQuery(cat)}
              title={`「${cat}」で記事を絞り込む`}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-default transition-colors"
            >
              {cat}
            </button>
          ) : (
            <span
              key={cat}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-muted"
            >
              {cat}
            </span>
          ),
        )}
      {onAddTag && onRemoveTag && article && (
        <TagEditor
          articleId={article.id}
          tags={tags ?? []}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
        />
      )}
    </div>
  );
}
