"use client";

import { memo, useCallback } from "react";
import type { Article, Collection, EngagementAction, Feed } from "../types";
import { getContentWidthStyle } from "../lib/reader-settings";
import { useArticleViewState } from "../hooks/useArticleViewState";
import { useHeaderScrollVisibility } from "../hooks/useHeaderScrollVisibility";
import EmptyArticleView from "./article-view/EmptyArticleView";
import ArticleNavigation from "./article-view/ArticleNavigation";
import SelectionExcludePopup from "./article-view/SelectionExcludePopup";
import ArticleHeader from "./article-view/ArticleHeader";
import ArticleAiPanel from "./article-view/ArticleAiPanel";
import ArticleContentBody from "./article-view/ArticleContentBody";
import ArticleNotePanel from "./article-view/ArticleNotePanel";
import ImageDownloadModal from "./article-view/ImageDownloadModal";
import InlineArticleNav from "./article-view/InlineArticleNav";
import AutoReadController from "./article-view/AutoReadController";

interface Props {
  article: Article | null;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  isInReadingList: boolean;
  onToggleReadingList: (id: string) => void;
  isLiked: boolean;
  onToggleLike: (id: string) => void;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
  onMobileBack?: () => void;
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  feeds?: Feed[];
  onSnooze?: (id: string, durationMs: number) => void;
  note?: string;
  onSetNote?: (articleId: string, text: string) => void;
  onDeleteNote?: (articleId: string) => void;
  onAutoMarkRead?: (articleId: string) => void;
  tags?: readonly string[];
  allTags?: Record<string, string[]>;
  onAddTag?: (articleId: string, tag: string) => void;
  onRemoveTag?: (articleId: string, tag: string) => void;
  onSetArticleTags?: (articleId: string, tags: readonly string[]) => void;
  onClearArticleTags?: (articleId: string) => void;
  collections?: Collection[];
  onAddToCollection?: (collectionId: string, articleId: string) => Promise<void>;
  onRemoveFromCollection?: (collectionId: string, articleId: string) => Promise<void>;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
  /** モバイルの現在のペイン（ジェスチャー衝突回避用） */
  currentMobilePane?: "sidebar" | "list" | "view";
  /** モバイル view ペインで右スワイプしたときのペイン戻り処理 */
  onGoBack?: () => void;
  /** オートモード ON/OFF（true ならコンテンツ取得 → TTS → 次へ自動） */
  autoMode?: boolean;
  /** オートモード解除コールバック（最終記事到達時に呼ばれる） */
  onAutoModeStop?: () => void;
  /** オートモードトグル（ヘッダーのボタン用） */
  onToggleAutoMode?: () => void;
}

function ArticleView({
  article,
  isBookmarked,
  onToggleBookmark,
  isInReadingList,
  onToggleReadingList,
  isLiked,
  onToggleLike,
  onEngagement,
  onMobileBack,
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
  feeds,
  onSnooze,
  note,
  onSetNote,
  onDeleteNote,
  onAutoMarkRead,
  tags,
  onAddTag,
  onRemoveTag,
  collections,
  onAddToCollection,
  onRemoveFromCollection,
  onCreateCollection,
  currentMobilePane,
  onGoBack,
  autoMode = false,
  onAutoModeStop,
  onToggleAutoMode,
}: Props) {
  const {
    contentWidth,
    globalFilter,
    onSaveGlobalFilter,
    storedContent,
    fetching,
    fetchError,
    fetchFullContent,
    resolvedOgImage,
    aiResult,
    aiResultProvider,
    aiLoading,
    aiError,
    doRunAi,
    resetAi,
    translateResult,
    translateLoading,
    translateError,
    handleTranslate,
    summaryRating,
    setSummaryRating,
    translateRating,
    setTranslateRating,
    contentTab,
    setContentTab,
    noteText,
    setNoteText,
    noteExpanded,
    setNoteExpanded,
    handleNoteBlur,
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    ttsRate,
    ttsCycleRate,
    handleTtsToggle,
    ttsSpeak,
    ttsStop,
    buildTtsText,
    translatedText,
    autoTranslatePending,
    autoSummarize,
    mainRef,
    contentRef,
    progressBarRef,
    selectionPopup,
    clearSelectionPopup,
    handleWheel,
    handleNavMouseDown,
    handleNavMouseUp,
    handleNavMouseLeave,
    handleTouchStart,
    handleTouchEnd,
    downloadAllImages,
    downloadingImages,
    imageDownloadProgress,
    confirmingDownload,
    isAlreadyDownloaded,
    confirmDownload,
    cancelDownload,
    embedInfo,
    processedContent,
    wrappedContent,
    activeSentenceIndex,
    galleryImages,
    canFetch,
    hasContent,
    hasFullContent,
    hasImages,
    readingMins,
    handleScroll,
  } = useArticleViewState({
    article,
    isBookmarked,
    isInReadingList,
    isLiked,
    note,
    onSetNote,
    onDeleteNote,
    onAutoMarkRead,
    onSelectPrev,
    onSelectNext,
    isNsfw: !!(article && feeds?.find((f) => f.id === article.feedHash)?.nsfw),
    currentMobilePane,
    onGoBack,
    autoMode,
  });

  // #677: ArticleHeader のスクロール連動表示 (下スクロールで隠す・上で表示・上端で常時)
  const { headerVisible, handleScrollForHeader } = useHeaderScrollVisibility(mainRef);
  const composedScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      handleScroll(e);
      handleScrollForHeader(e);
    },
    [handleScroll, handleScrollForHeader],
  );

  if (!article) {
    return <EmptyArticleView onMobileBack={onMobileBack} />;
  }

  return (
    <main
      ref={mainRef}
      aria-label="記事本文"
      className="h-full overflow-y-auto overflow-x-hidden bg-surface-elevated animate-fade-in relative"
      onScroll={composedScroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      <div
        ref={progressBarRef}
        className="sticky top-0 left-0 h-[2px] bg-ink z-10 transition-[width] duration-75 ease-linear"
        style={{ display: "none" }}
      />
      <div
        className="w-full mx-auto px-4 py-6 lg:px-10 lg:py-12 transition-[max-width] duration-200"
        style={getContentWidthStyle(contentWidth)}
      >
        {/* #677: 下スクロールで隠す sticky ラッパー (上スクロール / 上端で表示) */}
        <div
          className="sticky top-0 z-20 bg-surface-elevated transition-transform duration-200 ease-out"
          style={{
            transform: headerVisible ? "translateY(0)" : "translateY(-100%)",
          }}
        >
          <ArticleHeader
            article={article}
            onMobileBack={onMobileBack}
            onEngagement={onEngagement}
            feeds={feeds}
            embedInfo={embedInfo}
            readingMins={readingMins}
            hasContent={hasContent}
            aiResult={aiResult}
            aiLoading={aiLoading}
            aiError={aiError}
            resetAi={resetAi}
            doRunAi={doRunAi}
            fetching={fetching}
            handleTranslate={handleTranslate}
            translateResult={translateResult}
            translateLoading={translateLoading}
            translateError={translateError}
            ttsSupported={ttsSupported}
            ttsPlaying={ttsPlaying}
            ttsPaused={ttsPaused}
            ttsRate={ttsRate}
            ttsCycleRate={ttsCycleRate}
            onTtsToggle={handleTtsToggle}
            autoMode={autoMode}
            onToggleAutoMode={onToggleAutoMode ?? (() => {})}
            hasImages={hasImages}
            downloadAllImages={downloadAllImages}
            downloadingImages={downloadingImages}
            imageDownloadProgress={imageDownloadProgress}
            storedContent={storedContent}
            isBookmarked={isBookmarked}
            onToggleBookmark={onToggleBookmark}
            isInReadingList={isInReadingList}
            onToggleReadingList={onToggleReadingList}
            isLiked={isLiked}
            onToggleLike={onToggleLike}
            note={note}
            noteExpanded={noteExpanded}
            setNoteExpanded={setNoteExpanded}
            onSetNote={onSetNote}
            onSnooze={onSnooze}
            onSelectNext={onSelectNext}
            tags={tags}
            onAddTag={onAddTag}
            onRemoveTag={onRemoveTag}
            collections={collections}
            onAddToCollection={onAddToCollection}
            onRemoveFromCollection={onRemoveFromCollection}
            onCreateCollection={onCreateCollection}
          />
        </div>

        <h1 className="text-[22px] font-light leading-snug text-text-strong tracking-[0.02em] mb-8 line-clamp-3 min-h-[calc(3*1.375em)]">
          {article.title}
        </h1>

        <InlineArticleNav
          prevArticle={prevArticle}
          nextArticle={nextArticle}
          onSelectPrev={onSelectPrev}
          onSelectNext={onSelectNext}
          onMouseDown={handleNavMouseDown}
          onMouseUp={handleNavMouseUp}
          onMouseLeave={handleNavMouseLeave}
        />

        <ArticleAiPanel
          aiResult={aiResult}
          aiResultProvider={aiResultProvider}
          aiError={aiError}
          summaryRating={summaryRating}
          setSummaryRating={setSummaryRating}
          article={article}
          onEngagement={onEngagement}
          onRetry={article.link ? () => void doRunAi(article.link!, article.id) : undefined}
        />

        <ArticleContentBody
          ref={contentRef}
          article={article}
          embedInfo={embedInfo}
          processedContent={processedContent}
          wrappedContent={wrappedContent}
          activeSentenceIndex={activeSentenceIndex}
          resolvedOgImage={resolvedOgImage}
          translateResult={translateResult}
          translateError={translateError}
          onRetryTranslate={handleTranslate}
          contentTab={contentTab}
          setContentTab={setContentTab}
          translateRating={translateRating}
          setTranslateRating={setTranslateRating}
          onEngagement={onEngagement}
          canFetch={canFetch}
          fetching={fetching}
          fetchError={fetchError}
          fetchFullContent={fetchFullContent}
          galleryImages={galleryImages}
        />

        {onSetNote && (noteExpanded || noteText) && (
          <ArticleNotePanel
            noteText={noteText}
            setNoteText={setNoteText}
            noteExpanded={noteExpanded}
            setNoteExpanded={setNoteExpanded}
            handleNoteBlur={handleNoteBlur}
            note={note}
          />
        )}

        <ArticleNavigation
          prevArticle={prevArticle}
          nextArticle={nextArticle}
          onSelectPrev={onSelectPrev}
          onSelectNext={onSelectNext}
        />
      </div>

      {confirmingDownload && (
        <ImageDownloadModal
          isAlreadyDownloaded={isAlreadyDownloaded}
          onConfirm={() => void confirmDownload()}
          onCancel={cancelDownload}
        />
      )}
      {selectionPopup && article.link && (
        <SelectionExcludePopup
          popup={selectionPopup}
          article={{ title: article.title, link: article.link }}
          globalFilter={globalFilter ?? null}
          onSaveGlobalFilter={onSaveGlobalFilter ?? undefined}
          onClose={clearSelectionPopup}
        />
      )}
      <AutoReadController
        enabled={autoMode}
        article={article}
        ttsSupported={ttsSupported}
        ttsPlaying={ttsPlaying}
        ttsPaused={ttsPaused}
        fetching={fetching}
        fetchError={fetchError}
        hasFullContent={hasFullContent}
        canFetch={canFetch}
        ttsText={buildTtsText(
          article,
          processedContent,
          translatedText,
          // #696: オートモード時に自動要約 ON で要約結果が揃ったら、要約を読み上げ対象にする
          autoMode && autoSummarize ? aiResult : null,
        )}
        autoTranslatePending={autoTranslatePending}
        autoSummarizePending={autoMode && autoSummarize && !aiResult && !aiError}
        onSpeak={ttsSpeak}
        onTtsStop={ttsStop}
        onFetch={() => fetchFullContent()}
        hasNext={!!nextArticle}
        onSelectNext={onSelectNext}
        onAutoMarkRead={onAutoMarkRead}
        onAutoModeStop={onAutoModeStop ?? (() => {})}
      />
    </main>
  );
}

export default memo(ArticleView);
