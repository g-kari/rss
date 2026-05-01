"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { Article, Collection, EngagementAction, Feed } from "../types";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { readingTime, isLikelyJapanese } from "../lib/article-utils";
import { collectImageUrlsFromHtml } from "../lib/image-extractor";
import { extractEmbedInfo, processContent, stripIframes } from "../lib/embed-utils";
import { useArticleContent } from "../hooks/useArticleContent";
import { useArticleAi } from "../hooks/useArticleAi";
import { useImageDownload } from "../hooks/useImageDownload";
import { usePopupLock } from "../hooks/usePopupLock";
import { useArticleNote } from "../hooks/useArticleNote";
import { useArticleAiRatings } from "../hooks/useArticleAiRatings";
import { getContentWidthStyle } from "../lib/reader-settings";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { useEventListener } from "../hooks/useEventListener";
import { toPlainText } from "../lib/html";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useGestureNav } from "../hooks/useGestureNav";
import { useReadingProgress, loadProgress } from "../hooks/useReadingProgress";
import { ChevronSmall } from "./article-view/icons";
import EmptyArticleView from "./article-view/EmptyArticleView";
import ArticleNavigation from "./article-view/ArticleNavigation";
import SelectionExcludePopup, { useSelectionExclude } from "./article-view/SelectionExcludePopup";
import ArticleHeader from "./article-view/ArticleHeader";
import ArticleAiPanel from "./article-view/ArticleAiPanel";
import ArticleContentBody from "./article-view/ArticleContentBody";
import ArticleNotePanel from "./article-view/ArticleNotePanel";
import ImageDownloadModal from "./article-view/ImageDownloadModal";

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
}

const SHORT_CONTENT_THRESHOLD = 400;

export default function ArticleView({
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
}: Props) {
  const { theme, autoReadEnabled, autoReadThreshold, autoTranslate, contentWidth } =
    useReaderSettings();
  const { globalFilter, setGlobalFilter: onSaveGlobalFilter } = useArticleFilter();

  const { storedContent, fetching, fetchError, fetchFullContent, resolvedOgImage } =
    useArticleContent(article?.id, article?.link, article?.ogImage);

  const {
    aiResult,
    aiLoading,
    aiError,
    doRunAi,
    resetAi,
    translateResult,
    translateLoading,
    translateError,
    doTranslate,
    resetTranslate,
  } = useArticleAi(article?.id);

  const {
    summaryRating,
    setSummaryRating,
    translateRating,
    setTranslateRating,
    contentTab,
    setContentTab,
  } = useArticleAiRatings({ articleId: article?.id, translateResult });

  const { noteText, setNoteText, noteExpanded, setNoteExpanded, handleNoteBlur } = useArticleNote({
    article,
    note,
    onSetNote,
    onDeleteNote,
  });

  const {
    supported: ttsSupported,
    isPlaying: ttsPlaying,
    isPaused: ttsPaused,
    rate: ttsRate,
    cycleRate: ttsCycleRate,
    speak,
    stop: ttsStop,
  } = useSpeechSynthesis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    ttsStop();
  }, [article?.id]);

  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTranslate = useCallback(() => {
    if (!article?.link) return;
    if (translateResult) {
      resetTranslate();
      return;
    }
    if (translateLoading || fetching) return;
    const link = article.link;
    const id = article.id;
    if (storedContent) {
      doTranslate(link, id, storedContent);
      return;
    }
    void fetchFullContent((content) => {
      doTranslate(link, id, content);
    });
  }, [
    article,
    translateResult,
    translateLoading,
    fetching,
    storedContent,
    resetTranslate,
    doTranslate,
    fetchFullContent,
  ]);

  const autoTranslateTriggered = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoTranslate || !article?.id || !storedContent || translateResult || translateLoading)
      return;
    if (autoTranslateTriggered.current === article.id) return;
    if (isLikelyJapanese(toPlainText(storedContent).slice(0, 200))) return;
    autoTranslateTriggered.current = article.id;
    handleTranslate();
  }, [
    autoTranslate,
    article?.id,
    storedContent,
    translateResult,
    translateLoading,
    handleTranslate,
  ]);

  const shortcutRef = useSyncedRef({
    articleLink: article?.link,
    articleId: article?.id,
    storedContent,
    fetching,
    fetchFullContent,
    aiResult,
    aiLoading,
    doRunAi,
    resetAi,
    handleTranslate,
  });
  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = shortcutRef.current;
      if (e.key === "v" && s.articleLink && !s.storedContent && !s.fetching) {
        void s.fetchFullContent();
      }
      if (e.key === "a" && s.articleLink) {
        if (s.aiResult) {
          s.resetAi();
        } else if (!s.aiLoading && !s.fetching) {
          void s.doRunAi(s.articleLink, s.articleId!);
        }
      }
      if (e.key === "z" && s.articleLink) {
        s.handleTranslate();
      }
      if (e.key === " ") {
        const el = mainRef.current;
        if (!el) return;
        e.preventDefault();
        el.scrollBy({
          top: e.shiftKey ? -el.clientHeight * 0.8 : el.clientHeight * 0.8,
          behavior: "smooth",
        });
      }
    },
    document,
  );

  const progressBarRef = useRef<HTMLDivElement>(null);
  const { popup: selectionPopup, clearPopup: clearSelectionPopup } = useSelectionExclude(mainRef);
  const {
    handleWheel,
    handleNavMouseDown,
    handleNavMouseUp,
    handleNavMouseLeave,
    handleTouchStart,
    handleTouchEnd,
  } = useGestureNav({ onSelectPrev, onSelectNext });

  const {
    downloadAllImages,
    downloadingImages,
    imageDownloadProgress,
    confirmingDownload,
    isAlreadyDownloaded,
    confirmDownload,
    cancelDownload,
  } = useImageDownload(article, resolvedOgImage, contentRef);

  usePopupLock(confirmingDownload);

  const embedInfo = article?.link ? extractEmbedInfo(article.link) : null;

  const rawContent = storedContent ?? article?.content ?? null;
  const processedContent = useMemo(
    () =>
      rawContent
        ? embedInfo
          ? stripIframes(rawContent)
          : processContent(rawContent, theme)
        : null,
    [rawContent, embedInfo, theme],
  );

  const galleryImages = useMemo(
    () => (processedContent ? collectImageUrlsFromHtml(processedContent) : []),
    [processedContent],
  );

  // TTS キーボードショートカット (P)
  useEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (!ttsSupported) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== "P") return;
      if (!article) return;
      if (ttsPlaying || ttsPaused) {
        ttsStop();
      } else {
        const text = [article.title, toPlainText(processedContent ?? article.summary ?? "")]
          .filter(Boolean)
          .join("\n\n");
        if (text.trim()) speak(text);
      }
    },
    document,
  );

  useEffect(() => {
    if (progressBarRef.current) {
      const pct = article?.id ? (loadProgress(article.id)?.progress ?? 0) : 0;
      progressBarRef.current.style.width = `${pct}%`;
      progressBarRef.current.style.display = pct > 0 ? "" : "none";
    }
  }, [article?.id]);

  const autoReadEnabledRef = useSyncedRef(autoReadEnabled);
  const autoReadThresholdRef = useSyncedRef(autoReadThreshold);
  const onAutoMarkReadRef = useSyncedRef(onAutoMarkRead);
  const articleIdRef = useSyncedRef(article?.id);

  useReadingProgress({
    articleId: article?.id,
    contentRef,
    onProgressChange: (pct) => {
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct}%`;
        progressBarRef.current.style.display = pct > 0 ? "" : "none";
      }
      const currentArticleId = articleIdRef.current;
      if (
        autoReadEnabledRef.current &&
        pct >= autoReadThresholdRef.current &&
        currentArticleId &&
        onAutoMarkReadRef.current
      ) {
        onAutoMarkReadRef.current(currentArticleId);
      }
    },
  });

  if (!article) {
    return <EmptyArticleView onMobileBack={onMobileBack} />;
  }

  const isShortContent = !article.content || article.content.length < SHORT_CONTENT_THRESHOLD;
  const canFetch = !embedInfo && article.link && isShortContent && !storedContent;
  const hasContent = !!(processedContent || article.summary);
  const hasImages =
    !!(article.ogImage ?? resolvedOgImage) ||
    !!(processedContent && /<img\b/i.test(processedContent));
  const readingMins = readingTime(processedContent ?? article.summary ?? "");

  const handleTtsToggle = () => {
    if (ttsPlaying || ttsPaused) {
      ttsStop();
    } else {
      const text = [article.title, toPlainText(processedContent ?? article.summary ?? "")]
        .filter(Boolean)
        .join("\n\n");
      if (text.trim()) speak(text);
    }
  };

  function handleScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget;
    const scrollable = el.scrollHeight - el.clientHeight;
    const progress = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 0;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`;
      progressBarRef.current.style.display = progress > 0 ? "" : "none";
    }
    const currentArticleId = articleIdRef.current;
    if (
      autoReadEnabledRef.current &&
      progress >= autoReadThresholdRef.current &&
      currentArticleId &&
      onAutoMarkReadRef.current
    ) {
      onAutoMarkReadRef.current(currentArticleId);
    }
  }

  return (
    <main
      ref={mainRef}
      className="h-full overflow-y-auto bg-surface-elevated animate-fade-in relative"
      onScroll={handleScroll}
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
        className="mx-auto px-4 py-6 lg:px-10 lg:py-12 transition-[max-width] duration-200"
        style={getContentWidthStyle(contentWidth)}
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
          resetAi={resetAi}
          doRunAi={doRunAi}
          fetching={fetching}
          handleTranslate={handleTranslate}
          translateResult={translateResult}
          translateLoading={translateLoading}
          ttsSupported={ttsSupported}
          ttsPlaying={ttsPlaying}
          ttsPaused={ttsPaused}
          ttsRate={ttsRate}
          ttsCycleRate={ttsCycleRate}
          onTtsToggle={handleTtsToggle}
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

        <h1 className="text-[22px] font-light leading-snug text-text-strong tracking-[0.02em] mb-8 line-clamp-3 min-h-[91px]">
          {article.title}
        </h1>

        <div
          className="group relative flex items-center gap-3 h-[52px] mb-3 select-none cursor-ew-resize"
          onMouseDown={handleNavMouseDown}
          onMouseUp={handleNavMouseUp}
          onMouseLeave={handleNavMouseLeave}
        >
          <div className="flex-1 overflow-hidden flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {prevArticle && onSelectPrev && (
              <>
                <ChevronSmall direction="left" />
                <span className="text-[11px] text-text-faint truncate">{prevArticle.title}</span>
              </>
            )}
          </div>
          <div className="absolute inset-x-0 top-1/2 border-t border-border-subtle pointer-events-none" />
          <div className="flex-1 overflow-hidden flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {nextArticle && onSelectNext && (
              <>
                <span className="text-[11px] text-text-faint truncate">{nextArticle.title}</span>
                <ChevronSmall direction="right" />
              </>
            )}
          </div>
        </div>

        <ArticleAiPanel
          aiResult={aiResult}
          aiError={aiError}
          summaryRating={summaryRating}
          setSummaryRating={setSummaryRating}
          article={article}
          onEngagement={onEngagement}
        />

        <ArticleContentBody
          ref={contentRef}
          article={article}
          embedInfo={embedInfo}
          processedContent={processedContent}
          resolvedOgImage={resolvedOgImage}
          translateResult={translateResult}
          translateError={translateError}
          contentTab={contentTab}
          setContentTab={setContentTab}
          translateRating={translateRating}
          setTranslateRating={setTranslateRating}
          onEngagement={onEngagement}
          canFetch={!!canFetch}
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
    </main>
  );
}
