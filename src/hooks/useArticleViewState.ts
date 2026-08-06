"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Article } from "../types";
import type { Sentence } from "../lib/tts-sentences";

/**
 * #703: 要約読み上げ中にハイライトを抑制するための安定参照 (毎 render の identity 不変)。
 * Object.freeze で下流が誤って .push() しても TypeError throw する safety net。
 * (`react-patterns.md` の sentinel freeze 派生ケースに準拠)
 */
const EMPTY_SENTENCES = Object.freeze([] as Sentence[]) as Sentence[];
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../contexts/ArticleFilterContext";
import { isStoredContentJapanese } from "../lib/article-utils";
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
import { useBrowserAiAvailability } from "./useBrowserAiAvailability";
import { useArticleViewProgress } from "./useArticleViewProgress";
import { useTtsHighlight } from "./useTtsHighlight";

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
  /** #703: オートモード ON 時に要約を読み上げ中ならハイライトを抑制するために渡す */
  autoMode?: boolean;
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
  autoMode = false,
}: UseArticleViewStateParams) {
  const {
    theme,
    autoReadEnabled,
    autoReadThreshold,
    autoTranslate,
    autoSummarize,
    autoAiBrowserOnly,
    contentWidth,
    imageDlFolder,
    imageDlFolderNsfw,
  } = useReaderSettings();
  const { globalFilter, setGlobalFilter: onSaveGlobalFilter } = useArticleFilter();

  const { storedContent, fetching, fetchError, fetchRetryable, fetchFullContent, resolvedOgImage } =
    useArticleContent(article?.id, article?.link, article?.ogImage);

  const {
    aiResult,
    aiResultProvider,
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
    wrappedContent,
    ttsSentences,
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
  // #672 Phase 2: TTS ハイライト用 ref (useArticleViewTts に渡して speak 時に boundary を購読)
  const onBoundaryRef = useRef<((charIndex: number) => void) | null>(null);
  const onSpeakStartRef = useRef<(() => void) | null>(null);
  const {
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    ttsEndedCount,
    ttsRate,
    ttsCycleRate,
    ttsVolume,
    ttsCycleVolume,
    handleTtsToggle,
    ttsSpeak,
    ttsStop,
    buildTtsText,
  } = useArticleViewTts(
    article,
    processedContent,
    translatedText,
    onBoundaryRef,
    onSpeakStartRef,
    noteText,
  );

  // #703: オートモード + autoSummarize で要約を読み上げているとき、ハイライトは
  // 「記事本文」ではなく実際に読み上げているテキスト (要約) と一致させたい。
  // 要約テキストは sentence span 化していないため、その間はハイライト全体を抑制する
  // (ttsSentences を空配列にすることで activeSentenceIndex は -1 維持)。
  const isReadingSummary = autoMode && autoSummarize && !!aiResult;
  const effectiveTtsSentences = isReadingSummary ? EMPTY_SENTENCES : ttsSentences;

  // #672 Phase 2: TTS ハイライト hook (sentences と TTS state を渡して activeSentenceIndex を計算)
  const { activeSentenceIndex, handleBoundary, markSpeakStart } = useTtsHighlight(
    effectiveTtsSentences,
    ttsRate,
    ttsPlaying,
    ttsSupported,
  );
  // ref に最新ハンドラをアサイン (useArticleViewTts.speakWithHighlight が読む)
  onBoundaryRef.current = handleBoundary;
  onSpeakStartRef.current = markSpeakStart;

  // #653: autoTranslate ON で翻訳完了を待つべきか
  // - autoTranslate=true && 非日本語コンテンツ && 翻訳未完了 (loading 中含む) && エラーなし
  // → AutoReadController が speak を保留する
  const autoTranslatePending = useMemo(() => {
    if (!autoTranslate) return false;
    if (!storedContent) return false; // fetch 前は判定不可
    if (translateResult || translateError) return false; // 翻訳完了 or 失敗
    // 200 char だと英文 abstract / byline を含む記事冒頭で日本語判定 false → speak 不要保留が起きる罠を
    // 防ぐため canonical (browser-translator.ts#detectSourceLanguage) の 500 char sample に統一。
    if (isStoredContentJapanese(storedContent)) return false;
    return true;
  }, [autoTranslate, storedContent, translateResult, translateError]);

  // --- Keyboard shortcuts + auto-translate + auto-summarize ---
  // #700: ブラウザネイティブ AI の利用可否を mount 時に診断 (auto-trigger 判定用)
  const { translatorAvailable, summarizerAvailable } = useBrowserAiAvailability();

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
    autoSummarize,
    autoAiBrowserOnly,
    translatorAvailable,
    summarizerAvailable,
    translateResult,
    translateLoading,
  });

  // --- Reading progress ---
  const {
    progressBarRef,
    handleScroll,
    progress: readingProgress,
  } = useArticleViewProgress({
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
    // #843: 全文取得済 HTML を渡して collectImageUrlsFromHtml で本文画像を確実に拾う
    // (DOM 走査だけだと render タイミング次第で OGP 1 枚だけになる現象を防ぐ)
    processedContent,
    // #843 (再修正): ユーザーが画面で見ている「画像一覧」(ImageGallery) と
    // DL 対象を一致させるため galleryImages を最優先で渡す。
    galleryImages,
  });

  usePopupLock(confirmingDownload);

  return {
    contentWidth,
    globalFilter,
    onSaveGlobalFilter,
    storedContent,
    fetching,
    fetchError,
    fetchRetryable,
    fetchFullContent,
    resolvedOgImage,
    aiResult,
    aiResultProvider,
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
    ttsEndedCount,
    ttsRate,
    ttsCycleRate,
    ttsVolume,
    ttsCycleVolume,
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
    readingProgress,
  };
}
