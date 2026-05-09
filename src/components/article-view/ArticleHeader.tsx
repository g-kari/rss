"use client";

import React from "react";
import type { Article, Collection, EngagementAction, Feed } from "../../types";
import type { AiOperationResult } from "../../hooks/useArticleAi";
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
  /** Web Speech API から列挙された全 voice (#654) */
  ttsVoices: SpeechSynthesisVoice[];
  /** 現在ユーザーが選択している voice URI (null=自動選択) */
  ttsVoiceUri: string | null;
  /** voice を切り替える (null で自動選択に戻す) */
  setTtsVoiceUri: (uri: string | null) => void;
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
  ttsVoices,
  ttsVoiceUri,
  setTtsVoiceUri,
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

  const filterFeed = feeds ? feeds.find((f) => f.id === article.feedHash) : undefined;

  return (
    <div className="mb-5 text-[11px] text-text-muted flex flex-col gap-y-2">
      <ArticleHeaderMeta
        article={article}
        onMobileBack={onMobileBack}
        onEngagement={onEngagement}
        feeds={feeds}
        embedInfo={embedInfo}
        readingMins={readingMins}
        onSetAuthorFilter={onSetAuthorFilter}
        onSaveFilter={onSaveFilter}
        onSetQuery={onSetQuery}
        onCategoryToast={(msg, level) => {
          if (level === "success") toast.success(msg);
          else toast.info(msg);
        }}
        tags={tags}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
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
          resetAi={resetAi}
          doRunAi={doRunAi}
          handleTranslate={handleTranslate}
          translateResult={translateResult}
          translateLoading={translateLoading}
          ttsSupported={ttsSupported}
          ttsPlaying={ttsPlaying}
          ttsPaused={ttsPaused}
          ttsRate={ttsRate}
          ttsCycleRate={ttsCycleRate}
          ttsVoices={ttsVoices}
          ttsVoiceUri={ttsVoiceUri}
          setTtsVoiceUri={setTtsVoiceUri}
          onTtsToggle={onTtsToggle}
          autoMode={autoMode}
          onToggleAutoMode={onToggleAutoMode}
          downloadAllImages={downloadAllImages}
          downloadingImages={downloadingImages}
          imageDownloadProgress={imageDownloadProgress}
        />

        <ArticleHeaderShare
          article={article}
          feeds={feeds}
          storedContent={storedContent}
          onShareError={(msg) => toast.error(msg)}
          filterFeed={filterFeed}
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
          onRemoveFromCollection={onRemoveFromCollection}
          onCreateCollection={onCreateCollection}
          focusMode={focusMode}
          onToggleFocusMode={onToggleFocusMode}
        />
      </div>
    </div>
  );
}
