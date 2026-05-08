"use client";

import React from "react";
import type { Article, Collection, EngagementAction, Feed } from "../../types";
import type { AiOperationResult } from "../../hooks/useArticleAi";
import { useToast } from "../../contexts/ToastContext";
import { useReaderSettings } from "../../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import Spinner from "../Spinner";
import CollectionDropdown from "../CollectionDropdown";
import ShareMenu from "./ShareMenu";
import ToggleIconButton from "./ToggleIconButton";
import FilterMenu from "./FilterMenu";
import GlobalFilterMenu from "./GlobalFilterMenu";
import TagEditor from "./TagEditor";
import { DownloadIcon } from "./icons";
import type { EmbedInfo } from "../../lib/embed-utils";
import { useHeaderShareTargets } from "../../hooks/useHeaderShareTargets";
import { SHARE_TARGETS } from "./shareTargets";

interface Props {
  article: Article;
  onMobileBack?: () => void;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
  feeds?: Feed[];
  /** 埋め込み情報（YouTube / Spotify 等） */
  embedInfo: EmbedInfo | null;
  /** 読了推定時間（分） */
  readingMins: number;

  /* --- AI --- */
  hasContent: boolean;
  aiResult: string | null;
  aiLoading: boolean;
  resetAi: () => void;
  doRunAi: (link: string, articleId: string) => void;
  fetching: boolean;
  handleTranslate: () => void;
  translateResult: AiOperationResult | null;
  translateLoading: boolean;

  /* --- TTS --- */
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  ttsRate: number;
  ttsCycleRate: () => void;
  onTtsToggle: () => void;

  /* --- 画像ダウンロード --- */
  hasImages: boolean;
  downloadAllImages: () => void;
  downloadingImages: boolean;
  imageDownloadProgress: { done: number; total: number } | null;

  /* --- 本文コンテンツ参照 --- */
  storedContent: string | null;

  /* --- ブックマーク / 後で読む / いいね --- */
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  isInReadingList: boolean;
  onToggleReadingList: (id: string) => void;
  isLiked: boolean;
  onToggleLike: (id: string) => void;

  /* --- メモ --- */
  note?: string;
  noteExpanded: boolean;
  setNoteExpanded: (v: boolean) => void;
  onSetNote?: (articleId: string, text: string) => void;

  /* --- スヌーズ --- */
  onSnooze?: (id: string, durationMs: number) => void;
  onSelectNext?: () => void;

  /* --- タグ --- */
  tags?: readonly string[];
  onAddTag?: (articleId: string, tag: string) => void;
  onRemoveTag?: (articleId: string, tag: string) => void;

  /* --- コレクション --- */
  collections?: Collection[];
  onAddToCollection?: (collectionId: string, articleId: string) => Promise<void>;
  onRemoveFromCollection?: (collectionId: string, articleId: string) => Promise<void>;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
}

export default function ArticleHeader({
  article,
  onMobileBack,
  onEngagement,
  feeds,
  embedInfo,
  readingMins,
  hasContent,
  aiResult,
  aiLoading,
  resetAi,
  doRunAi,
  fetching,
  handleTranslate,
  translateResult,
  translateLoading,
  ttsSupported,
  ttsPlaying,
  ttsPaused,
  ttsRate,
  ttsCycleRate,
  onTtsToggle,
  hasImages,
  downloadAllImages,
  downloadingImages,
  imageDownloadProgress,
  storedContent,
  isBookmarked,
  onToggleBookmark,
  isInReadingList,
  onToggleReadingList,
  isLiked,
  onToggleLike,
  note,
  noteExpanded,
  setNoteExpanded,
  onSetNote,
  // onSnooze / onSelectNext は #619 でスヌーズ UI をオミットしたため未使用。
  // バックエンド復活時に SnoozeMenu レンダリングで利用するため、props は残しつつ
  // アンダースコアプレフィックスで lint 抑止する。
  onSnooze: _onSnooze,
  onSelectNext: _onSelectNext,
  tags,
  onAddTag,
  onRemoveTag,
  collections,
  onAddToCollection,
  onRemoveFromCollection,
  onCreateCollection,
}: Props) {
  const toast = useToast();
  const { focusMode, toggleFocusMode: onToggleFocusMode } = useReaderSettings();
  const {
    onSaveFilter,
    globalFilter,
    setGlobalFilter: onSaveGlobalFilter,
    updateQuery: onSetQuery,
    setAuthorFilter,
  } = useArticleFilter();
  const [headerShareTargetIds] = useHeaderShareTargets();
  const enabledShareTargets = SHARE_TARGETS.filter((t) => headerShareTargetIds.includes(t.id));

  const onSetAuthorFilter = (author: string) => {
    setAuthorFilter(author);
    toast.info(`「${author}」の記事に絞り込みました`);
  };

  const filterFeed = feeds ? feeds.find((f) => f.id === article.feedHash) : undefined;

  return (
    <div className="mb-5 text-[11px] text-text-muted flex flex-col gap-y-2">
      {/* メタ情報: 戻るボタン + 日付/著者/リンク/読了時間 */}
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
        {article.publishedAt && !isNaN(new Date(article.publishedAt).getTime()) && (
          <time className="tracking-[0.04em]">
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
          article.categories.slice(0, 5).map((cat) =>
            filterFeed && onSaveFilter ? (
              <button
                key={cat}
                onClick={() => {
                  const existingExclude = filterFeed.filter?.exclude ?? [];
                  if (existingExclude.includes(cat)) {
                    toast.info(`「${cat}」は既に除外フィルターに登録されています`);
                    return;
                  }
                  void onSaveFilter(filterFeed.id, {
                    include: filterFeed.filter?.include ?? [],
                    exclude: [...existingExclude, cat],
                    matchCategories: true,
                  }).then(() => toast.success(`「${cat}」を除外カテゴリに追加しました`));
                }}
                title={`「${cat}」をフィードの除外カテゴリに追加`}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-default transition-colors"
              >
                {cat}
              </button>
            ) : onSetQuery ? (
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

      {/* アクションボタン群: 右寄せ flex-wrap */}
      <div
        data-print="hide"
        className="flex flex-wrap justify-end items-center gap-2 lg:gap-1.5 lg:flex-nowrap"
      >
        {/* AI 要約・翻訳ボタン */}
        {hasContent && (
          <div className="flex items-center gap-1 mr-1">
            <button
              onClick={() => {
                if (aiResult) {
                  resetAi();
                  return;
                }
                if (article.link) doRunAi(article.link, article.id);
              }}
              disabled={aiLoading || fetching}
              title="AI 要約 (a)"
              aria-label="AI 要約"
              className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
                aiResult
                  ? "border-ink bg-ink text-ink-text"
                  : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
              }`}
            >
              {aiLoading ? "…" : "要約"}
            </button>
            <button
              onClick={handleTranslate}
              disabled={translateLoading || fetching}
              title="AI 翻訳（日本語）(z)"
              aria-label="AI 翻訳"
              className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
                translateResult
                  ? "border-ink bg-ink text-ink-text"
                  : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
              }`}
            >
              {translateLoading ? "…" : "翻訳"}
            </button>
          </div>
        )}

        {hasImages && (
          <button
            onClick={() => {
              void downloadAllImages();
            }}
            disabled={downloadingImages}
            title="記事内の画像をすべてダウンロード"
            aria-label="画像をダウンロード"
            className="p-2 -m-2 lg:p-0 lg:m-0 text-text-faint hover:text-text-muted transition-colors duration-200 disabled:opacity-50 flex items-center gap-1 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px]"
          >
            {downloadingImages && imageDownloadProgress ? (
              <span className="text-[10px] tabular-nums tracking-tight">
                {imageDownloadProgress.done}/{imageDownloadProgress.total}
              </span>
            ) : null}
            {downloadingImages ? <Spinner /> : <DownloadIcon />}
          </button>
        )}

        {ttsSupported && hasContent && (
          <button
            onClick={onTtsToggle}
            title={ttsPlaying || ttsPaused ? "読み上げを停止" : "読み上げ (P)"}
            aria-label={ttsPlaying || ttsPaused ? "読み上げを停止" : "読み上げ"}
            className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px] ${
              ttsPlaying || ttsPaused
                ? "text-ink hover:text-text-muted"
                : "text-text-faint hover:text-text-muted"
            }`}
          >
            {ttsPlaying ? (
              /* 停止アイコン（■） */
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="none">
                <rect x="2" y="2" width="10" height="10" rx="2" />
              </svg>
            ) : ttsPaused ? (
              /* 一時停止中アイコン（スピーカー + 波線） */
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 5H5L9 2V12L5 9H2V5Z" />
                <path
                  d="M11 4.5C11 4.5 12.5 6 12.5 7C12.5 8 11 9.5 11 9.5"
                  strokeDasharray="2 1.5"
                />
              </svg>
            ) : (
              /* 通常スピーカーアイコン */
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 5H5L9 2V12L5 9H2V5Z" />
                <path d="M11 4.5C11 4.5 12.5 6 12.5 7C12.5 8 11 9.5 11 9.5" />
              </svg>
            )}
          </button>
        )}

        {ttsSupported && hasContent && (
          <button
            onClick={ttsCycleRate}
            title={`読み上げ速度: ${ttsRate}x（クリックで変更）`}
            aria-label={`読み上げ速度 ${ttsRate}倍`}
            className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 text-[10px] font-medium tabular-nums leading-none ${
              ttsPlaying || ttsPaused
                ? "text-ink hover:text-text-muted"
                : "text-text-faint hover:text-text-muted"
            }`}
          >
            {`${ttsRate}x`}
          </button>
        )}

        {/* クイックシェアボタン（設定で有効にしたものだけ表示） */}
        {enabledShareTargets.length > 0 && article.link && (
          <div className="flex items-center gap-1">
            {enabledShareTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => {
                  if (target.clipboardText) {
                    const text = target.clipboardText(article.link!, article.title);
                    navigator.clipboard
                      .writeText(text)
                      .then(() =>
                        window.open(
                          target.buildUrl(article.link!, article.title),
                          "_blank",
                          "noopener,noreferrer",
                        ),
                      )
                      .catch(() => toast.error("コピーに失敗しました"));
                  } else {
                    window.open(
                      target.buildUrl(article.link!, article.title),
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }
                }}
                title={target.label}
                aria-label={target.label}
                className="p-2 -m-2 lg:p-0 lg:m-0 text-text-faint hover:text-text-muted transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px]"
              >
                {target.icon}
              </button>
            ))}
          </div>
        )}

        {article.link && (
          <ShareMenu
            article={article}
            feed={feeds?.find((f) => f.id === article.feedHash)}
            contentHtml={storedContent ?? undefined}
          />
        )}
        {filterFeed && onSaveFilter && (
          <FilterMenu article={article} feed={filterFeed} onSaveFilter={onSaveFilter} />
        )}
        {onSaveGlobalFilter && (
          <GlobalFilterMenu
            article={article}
            globalFilter={globalFilter ?? null}
            onSaveGlobalFilter={onSaveGlobalFilter}
          />
        )}
        {/* スヌーズ機能は UI からオミット (#619)。バックエンドの hook / lib は残してあるため、
            必要時に SnoozeMenu レンダリングを復活させれば再有効化できる。 */}

        {/* 後で読む / ブックマーク / いいね — 独立トグル */}
        <div className="flex items-center rounded-full border border-border-default overflow-hidden">
          <button
            onClick={() => {
              onToggleReadingList(article.id);
              toast.info(isInReadingList ? "後で読むから削除" : "後で読むに追加");
            }}
            title={isInReadingList ? "後で読むから削除" : "後で読む (T)"}
            aria-label={isInReadingList ? "後で読むから削除" : "後で読む"}
            className={`px-2.5 py-1.5 transition-colors duration-200 [&>svg]:w-[14px] [&>svg]:h-[14px] lg:[&>svg]:w-[12px] lg:[&>svg]:h-[12px] ${
              isInReadingList
                ? "bg-ink text-ink-text"
                : "text-text-faint hover:text-text-default hover:bg-surface-hover"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isInReadingList ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </button>
          <div className="w-px self-stretch bg-border-default" />
          <button
            onClick={() => {
              onToggleBookmark(article.id);
            }}
            title={isBookmarked ? "ブックマーク解除 (b)" : "ブックマーク (b)"}
            aria-label={isBookmarked ? "ブックマーク解除" : "ブックマーク"}
            className={`px-2.5 py-1.5 transition-colors duration-200 [&>svg]:w-[14px] [&>svg]:h-[14px] lg:[&>svg]:w-[12px] lg:[&>svg]:h-[12px] ${
              isBookmarked
                ? "bg-bookmark text-ink-text"
                : "text-text-faint hover:text-bookmark hover:bg-surface-hover"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isBookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
              />
            </svg>
          </button>
          <div className="w-px self-stretch bg-border-default" />
          <button
            onClick={() => {
              onToggleLike(article.id);
            }}
            title={isLiked ? "いいね解除 (I)" : "いいね (I)"}
            aria-label={isLiked ? "いいね解除" : "いいね"}
            className={`px-2.5 py-1.5 transition-colors duration-200 [&>svg]:w-[14px] [&>svg]:h-[14px] lg:[&>svg]:w-[12px] lg:[&>svg]:h-[12px] ${
              isLiked
                ? "bg-rose-400 text-white"
                : "text-text-faint hover:text-error hover:bg-surface-hover"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={isLiked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
        {onSetNote && (
          <ToggleIconButton
            isActive={!!note}
            onClick={() => {
              if (noteExpanded && !note) {
                setNoteExpanded(false);
              } else {
                setNoteExpanded(true);
              }
            }}
            title={note ? "メモを編集" : "メモを追加"}
            activeClass="text-amber-400 hover:text-text-muted"
            inactiveClass="text-text-faint hover:text-amber-400"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </ToggleIconButton>
        )}
        {collections && onAddToCollection && onRemoveFromCollection && (
          <CollectionDropdown
            articleId={article.id}
            collections={collections}
            onAdd={onAddToCollection}
            onRemove={onRemoveFromCollection}
            onCreateNew={onCreateCollection}
          />
        )}
        <button
          onClick={onToggleFocusMode}
          title={focusMode ? "フォーカスモード終了 (\\)" : "フォーカスモード (\\)"}
          aria-label={focusMode ? "フォーカスモード終了" : "フォーカスモード"}
          className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${focusMode ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
        >
          <svg
            className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {focusMode ? (
              <>
                <path d="M9 9L3 3m0 0h6m-6 0v6" />
                <path d="M15 9l6-6m0 0h-6m6 0v6" />
                <path d="M9 15l-6 6m0 0h6m-6 0v-6" />
                <path d="M15 15l6 6m0 0h-6m6 0v-6" />
              </>
            ) : (
              <>
                <path d="M3 9V3m0 0h6M3 3l6 6" />
                <path d="M21 9V3m0 0h-6m6 0l-6 6" />
                <path d="M3 15v6m0 0h6m-6 0l6-6" />
                <path d="M21 15v6m0 0h-6m6 0l-6-6" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
