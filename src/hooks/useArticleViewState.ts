"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Article } from "../types";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { readingTime, isLikelyJapanese } from "../lib/article-utils";
import { collectImageUrlsFromHtml } from "../lib/image-extractor";
import { extractEmbedInfo, processContent, stripIframes } from "../lib/embed-utils";
import { useArticleContent } from "./useArticleContent";
import { useArticleAi } from "./useArticleAi";
import { useImageDownload } from "./useImageDownload";
import { usePopupLock } from "./usePopupLock";
import { useArticleNote } from "./useArticleNote";
import { useArticleAiRatings } from "./useArticleAiRatings";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import { toPlainText } from "../lib/html";
import { useSpeechSynthesis } from "./useSpeechSynthesis";
import { useGestureNav } from "./useGestureNav";
import { useReadingProgress, loadProgress } from "./useReadingProgress";
import { useSelectionExclude } from "../components/article-view/SelectionExcludePopup";

const SHORT_CONTENT_THRESHOLD = 400;

interface UseArticleViewStateParams {
  article: Article | null;
  isBookmarked: boolean;
  isInReadingList: boolean;
  isLiked: boolean;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  note?: string;
  onSetNote?: (articleId: string, text: string) => void;
  onDeleteNote?: (articleId: string) => void;
  onAutoMarkRead?: (articleId: string) => void;
}

export function useArticleViewState({
  article,
  note,
  onSetNote,
  onDeleteNote,
  onAutoMarkRead,
  onSelectPrev,
  onSelectNext,
}: UseArticleViewStateParams) {
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
  useEffect(() => {
    ttsStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ttsStop を deps に入れると再生→停止→再生のループが発生する
  }, [article?.id]);

  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

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

  const isShortContent = !article?.content || article.content.length < SHORT_CONTENT_THRESHOLD;
  const canFetch = !embedInfo && article?.link && isShortContent && !storedContent;
  const hasContent = !!(processedContent || article?.summary);
  const hasImages =
    !!(article?.ogImage ?? resolvedOgImage) ||
    !!(processedContent && /<img\b/i.test(processedContent));
  const readingMins = readingTime(processedContent ?? article?.summary ?? "");

  const handleTtsToggle = useCallback(() => {
    if (ttsPlaying || ttsPaused) {
      ttsStop();
    } else {
      if (!article) return;
      const text = [article.title, toPlainText(processedContent ?? article.summary ?? "")]
        .filter(Boolean)
        .join("\n\n");
      if (text.trim()) speak(text);
    }
  }, [ttsPlaying, ttsPaused, ttsStop, speak, article, processedContent]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
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
    },
    [articleIdRef, autoReadEnabledRef, autoReadThresholdRef, onAutoMarkReadRef],
  );

  return {
    contentWidth,
    globalFilter,
    onSaveGlobalFilter,
    storedContent,
    fetching,
    fetchError,
    fetchFullContent,
    resolvedOgImage,
    aiResult,
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
    galleryImages,
    canFetch: !!canFetch,
    hasContent,
    hasImages,
    readingMins,
    handleScroll,
  };
}
