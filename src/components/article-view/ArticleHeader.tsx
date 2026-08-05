"use client";

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

      <div
        data-print="hide"
        className="flex flex-wrap justify-end items-center gap-2 lg:gap-1.5 lg:flex-nowrap"
      >
        <ArticleHeaderAiTts
          article={article}
          hasContent={hasContent}
          hasImages={hasImages}
          fetching={fetching}
          aiResult={aiResult}
          aiLoading={aiLoading}
          aiError={aiError}
          resetAi={resetAi}
          doRunAi={doRunAi}
          handleTranslate={handleTranslate}
          translateResult={translateResult}
          translateLoading={translateLoading}
          translateError={translateError}
          ttsSupported={ttsSupported}
          ttsPlaying={ttsPlaying}
          ttsPaused={ttsPaused}
          ttsRate={ttsRate}
          ttsCycleRate={ttsCycleRate}
          ttsVolume={ttsVolume}
          ttsCycleVolume={ttsCycleVolume}
          onTtsToggle={onTtsToggle}
          autoMode={autoMode}
          onToggleAutoMode={onToggleAutoMode}
          downloadAllImages={downloadAllImages}
          downloadingImages={downloadingImages}
          imageDownloadProgress={imageDownloadProgress}
        />

        <ArticleHeaderShare
          article={article}
          feed={feed}
          storedContent={storedContent}
          onShareError={(msg) => toast.error(msg)}
          onSaveFilter={onSaveFilter}
          globalFilter={globalFilter}
          onSaveGlobalFilter={onSaveGlobalFilter}
        />

        <ArticleHeaderEngagement
          article={article}
          isBookmarked={isBookmarked}
          onToggleBookmark={onToggleBookmark}
          isInReadingList={isInReadingList}
          onToggleReadingList={onToggleReadingList}
          isLiked={isLiked}
          onToggleLike={onToggleLike}
          onReadingListToast={(msg) => toast.info(msg)}
          note={note}
          noteExpanded={noteExpanded}
          setNoteExpanded={setNoteExpanded}
          onSetNote={onSetNote}
          collections={collections}
          onAddToCollection={onAddToCollection}
          onAddBulkToCollection={onAddBulkToCollection}
          bookmarkIds={bookmarkIds}
          onRemoveFromCollection={onRemoveFromCollection}
          onCreateCollection={onCreateCollection}
          focusMode={focusMode}
          onToggleFocusMode={onToggleFocusMode}
        />
      </div>
    </div>
  );
}
