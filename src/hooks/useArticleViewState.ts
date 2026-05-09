"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Article } from "../types";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { isLikelyJapanese } from "../lib/article-utils";
import { toPlainText } from "../lib/html";
import { useArticleContent } from "./useArticleContent";
import { useArticleAi } from "./useArticleAi";
import { useImageDownload } from "./useImageDownload";
import { usePopupLock } from "./usePopupLock";
import { useArticleNote } from "./useArticleNote";
import { useArticleAiRatings } from "./useArticleAiRatings";
import { useGestureNav } from "./useGestureNav";
import { useSelectionExclude } from "../components/article-view/SelectionExcludePopup";
import { useArticleViewContent } from "./useArticleViewContent";
import { useArticleViewTts } from "./useArticleViewTts";
import { useArticleViewShortcuts } from "./useArticleViewShortcuts";
import { useArticleViewProgress } from "./useArticleViewProgress";

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
  isNsfw?: boolean;
  /** モバイルの現在のペイン（ジェスチャー衝突回避用） */
  currentMobilePane?: "sidebar" | "list" | "view";
  /** モバイル view ペインで右スワイプしたときのペイン戻り処理 */
  onGoBack?: () => void;
}

export function useArticleViewState({
  article,
  note,
  onSetNote,
  onDeleteNote,
  onAutoMarkRead,
  onSelectPrev,
  onSelectNext,
  isNsfw,
  currentMobilePane,
  onGoBack,
}: UseArticleViewStateParams) {
  const {
    theme,
    autoReadEnabled,
    autoReadThreshold,
    autoTranslate,
    contentWidth,
    imageDlFolder,
    imageDlFolderNsfw,
  } = useReaderSettings();
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

  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [article?.id]);

  const handleRunAi = useCallback(
    (link: string, id: string) => {
      if (storedContent) {
        void doRunAi(link, id, storedContent);
        return;
      }
      void fetchFullContent((content) => {
        void doRunAi(link, id, content);
      });
    },
    [storedContent, doRunAi, fetchFullContent],
  );

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

  // --- Content processing ---
  const {
    embedInfo,
    processedContent,
    galleryImages,
    canFetch,
    hasContent,
    hasFullContent,
    hasImages,
    readingMins,
  } = useArticleViewContent(article, storedContent, resolvedOgImage, theme);

  // --- TTS ---
  // #653: 翻訳結果があれば TTS は翻訳側を読み上げる
  const translatedText = translateResult && translateResult.text ? translateResult.text : null;
  const {
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    ttsRate,
    ttsCycleRate,
    ttsVoices,
    ttsVoiceUri,
    setTtsVoiceUri,
    handleTtsToggle,
    ttsSpeak,
    ttsStop,
    buildTtsText,
  } = useArticleViewTts(article, processedContent, translatedText);

  // #653: autoTranslate ON で翻訳完了を待つべきか
  // - autoTranslate=true && 非日本語コンテンツ && 翻訳未完了 (loading 中含む) && エラーなし
  // → AutoReadController が speak を保留する
  const autoTranslatePending = useMemo(() => {
    if (!autoTranslate) return false;
    if (!storedContent) return false; // fetch 前は判定不可
    if (translateResult || translateError) return false; // 翻訳完了 or 失敗
    if (isLikelyJapanese(toPlainText(storedContent).slice(0, 200))) return false;
    return true;
  }, [autoTranslate, storedContent, translateResult, translateError]);

  // --- Keyboard shortcuts + auto-translate ---
  useArticleViewShortcuts({
    article,
    storedContent,
    fetching,
    fetchFullContent,
    aiResult,
    aiLoading,
    doRunAi: handleRunAi,
    resetAi,
    handleTranslate,
    mainRef,
    autoTranslate,
    translateResult,
    translateLoading,
  });

  // --- Reading progress ---
  const { progressBarRef, handleScroll } = useArticleViewProgress({
    articleId: article?.id,
    contentRef,
    autoReadEnabled,
    autoReadThreshold,
    onAutoMarkRead,
  });

  // --- Selection popup ---
  const { popup: selectionPopup, clearPopup: clearSelectionPopup } = useSelectionExclude(mainRef);

  // --- Gesture navigation ---
  const {
    handleWheel,
    handleNavMouseDown,
    handleNavMouseUp,
    handleNavMouseLeave,
    handleTouchStart,
    handleTouchEnd,
  } = useGestureNav({ onSelectPrev, onSelectNext, currentMobilePane, onGoBack });

  // --- Image download ---
  const {
    downloadAllImages,
    downloadingImages,
    imageDownloadProgress,
    confirmingDownload,
    isAlreadyDownloaded,
    confirmDownload,
    cancelDownload,
  } = useImageDownload(article, resolvedOgImage, contentRef, {
    isNsfw,
    dlFolder: imageDlFolder,
    dlFolderNsfw: imageDlFolderNsfw,
  });

  usePopupLock(confirmingDownload);

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
    doRunAi: handleRunAi,
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
    ttsVoices,
    ttsVoiceUri,
    setTtsVoiceUri,
    handleTtsToggle,
    ttsSpeak,
    ttsStop,
    buildTtsText,
    translatedText,
    autoTranslatePending,
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
    canFetch,
    hasContent,
    hasFullContent,
    hasImages,
    readingMins,
    handleScroll,
  };
}
