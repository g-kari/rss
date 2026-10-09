"use client";

import { useId, useState } from "react";
import type { Article, Collection, EngagementAction, Feed } from "../../types";
import type { AiOperationResult, AiError } from "../../hooks/useArticleAi";
import { useToast } from "../../contexts/ToastContext";
import { useReaderSettings } from "../../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import type { EmbedInfo } from "../../lib/embed-utils";
import ArticleHeaderMeta from "./ArticleHeaderMeta";
import ArticleHeaderAiTts from "./ArticleHeaderAiTts";
import ArticleHeaderShare from "./ArticleHeaderShare";
import ArticleHeaderEngagement from "./ArticleHeaderEngagement";
import QuickReadingSettings from "../QuickReadingSettings";

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
  /** UX 監査 (#1): エラー時にヘッダーボタンを目立たせる */
  aiError: AiError | null;
  resetAi: () => void;
  doRunAi: (link: string, articleId: string) => void;
  fetching: boolean;
  handleTranslate: () => void;
  translateResult: AiOperationResult | null;
  translateLoading: boolean;
  /** UX 監査 (#1): エラー時にヘッダーボタンを目立たせる */
  translateError: AiError | null;

  /* --- TTS --- */
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  ttsRate: number;
  ttsCycleRate: () => void;
  ttsVolume: number;
  ttsCycleVolume: () => void;
  onTtsToggle: () => void;
  autoMode: boolean;
  onToggleAutoMode: () => void;

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
  /** Bookmark カスタム collection (案 B snapshot) — bookmarkIds 全件を bulk 追加 */
  onAddBulkToCollection?: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
  /** Bookmark カスタム collection 用の bookmark Set (snapshot として bulk 追加対象) */
  bookmarkIds?: ReadonlySet<string>;
  onRemoveFromCollection?: (collectionId: string, articleId: string) => Promise<void>;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
}

/**
 * 記事ヘッダー（オーケストレーター）。
 *
 * 4 つのサブコンポーネントを 2 行レイアウトで合成：
 * - 上段（メタ情報）: 戻るボタン + 日付 + 著者 + 元記事リンク + 読了時間 + カテゴリ + タグ
 * - 下段（アクション群）: AI/TTS, シェア, エンゲージメント
 */
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
  aiError,
  resetAi,
  doRunAi,
  fetching,
  handleTranslate,
  translateResult,
  translateLoading,
  translateError,
  ttsSupported,
  ttsPlaying,
  ttsPaused,
  ttsRate,
  ttsCycleRate,
  ttsVolume,
  ttsCycleVolume,
  onTtsToggle,
  autoMode,
  onToggleAutoMode,
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
  onAddBulkToCollection,
  bookmarkIds,
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

  const onSetAuthorFilter = (author: string) => {
    setAuthorFilter(author);
    toast.info(`「${author}」の記事に絞り込みました`);
  };

  const feed = feeds?.find((candidate) => candidate.id === article.feedHash);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const moreActive = autoMode || focusMode || ttsPlaying || ttsPaused;

  const aiTtsProps = {
    article,
    hasContent,
    hasImages,
    fetching,
    aiResult,
    aiLoading,
    aiError,
    resetAi,
    doRunAi,
    handleTranslate,
    translateResult,
    translateLoading,
    translateError,
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    ttsRate,
    ttsCycleRate,
    ttsVolume,
    ttsCycleVolume,
    onTtsToggle,
    autoMode,
    onToggleAutoMode,
    downloadAllImages,
    downloadingImages,
    imageDownloadProgress,
  };
  const shareProps = {
    article,
    feed,
    storedContent,
    onShareError: (msg: string) => toast.error(msg),
    onSaveFilter,
    globalFilter,
    onSaveGlobalFilter,
  };
  const engagementProps = {
    article,
    isBookmarked,
    onToggleBookmark,
    isInReadingList,
    onToggleReadingList,
    isLiked,
    onToggleLike,
    onReadingListToast: (msg: string) => toast.info(msg),
    note,
    noteExpanded,
    setNoteExpanded,
    onSetNote,
    collections,
    onAddToCollection,
    onAddBulkToCollection,
    bookmarkIds,
    onRemoveFromCollection,
    onCreateCollection,
    focusMode,
    onToggleFocusMode,
  };

  return (
    <div className="mb-5 text-[11px] text-text-muted flex flex-col gap-y-2">
      <ArticleHeaderMeta
        article={article}
        onMobileBack={onMobileBack}
        onEngagement={onEngagement}
        embedInfo={embedInfo}
        readingMins={readingMins}
        onSetAuthorFilter={onSetAuthorFilter}
        onSetQuery={onSetQuery}
        tags={tags}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        feedName={feed?.title}
      />

      <div data-print="hide" className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end items-center gap-2 lg:gap-1.5 lg:flex-nowrap">
          <QuickReadingSettings key={article.id} />
          <ArticleHeaderAiTts section="primary" {...aiTtsProps} />
          <ArticleHeaderShare section="primary" {...shareProps} />
          <ArticleHeaderEngagement section="primary" {...engagementProps} />
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? moreId : undefined}
            aria-label="その他の操作"
            title="その他の操作（画像保存・読み上げ速度・フィルター・印刷など）"
            className={`relative p-2 -m-2 max-md:min-w-[44px] max-md:min-h-[44px] lg:p-0 lg:m-0 lg:min-w-[24px] lg:min-h-[24px] flex items-center justify-center transition-colors duration-200 ${
              moreOpen ? "text-text-strong" : "text-text-faint hover:text-text-muted"
            }`}
          >
            <svg
              className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
            {moreActive && !moreOpen && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 lg:-top-0.5 lg:-right-0.5 w-1.5 h-1.5 rounded-full bg-accent"
              />
            )}
          </button>
        </div>
        {moreOpen && (
          <div
            id={moreId}
            role="group"
            aria-label="追加の操作"
            className="flex flex-wrap justify-end items-center gap-2 lg:gap-1.5 pt-1 border-t border-border-subtle"
          >
            <ArticleHeaderAiTts section="secondary" {...aiTtsProps} />
            <ArticleHeaderShare section="secondary" {...shareProps} />
            <ArticleHeaderEngagement section="secondary" {...engagementProps} />
          </div>
        )}
      </div>
    </div>
  );
}
