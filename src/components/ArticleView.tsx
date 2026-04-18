"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  Article,
  EngagementAction,
  Feed,
  FontFamily,
  FontSize,
  KeywordFilter,
} from "../types";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import {
  readingTime,
  FONT_SIZE_CYCLE,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
  collectImageUrlsFromHtml,
} from "../lib/article-utils";
import { extractEmbedInfo, processContent, stripIframes } from "../lib/embed-utils";
import { useArticleContent } from "../hooks/useArticleContent";
import { useArticleAi } from "../hooks/useArticleAi";
import Spinner from "./Spinner";
import { useImageDownload } from "../hooks/useImageDownload";
import { usePopupLock } from "../hooks/usePopupLock";
import { useContentLinkPreviews } from "../hooks/useContentLinkPreviews";
import { useArticleNote } from "../hooks/useArticleNote";
import { useArticleAiRatings } from "../hooks/useArticleAiRatings";
import { useArticleHighlight } from "../hooks/useArticleHighlight";
import { useSyntaxHighlight } from "../hooks/useSyntaxHighlight";
import { useMathRender } from "../hooks/useMathRender";
import { useSliderGallery } from "../hooks/useSliderGallery";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import {
  type LineHeight,
  type ContentWidth,
  LINE_HEIGHT_CYCLE,
  CONTENT_WIDTH_CYCLE,
  LINE_HEIGHT_LABELS,
  CONTENT_WIDTH_LABELS,
  getLineHeightStyle,
  getContentWidthStyle,
  cycleLineHeight,
  cycleContentWidth,
} from "../lib/reader-settings";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { useEventListener } from "../hooks/useEventListener";
import { sanitizeHtml, toPlainText } from "../lib/html";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useGestureNav } from "../hooks/useGestureNav";
import { useReadingProgress, loadProgress } from "../hooks/useReadingProgress";
import { ChevronSmall, DownloadIcon } from "./article-view/icons";
import EmptyArticleView from "./article-view/EmptyArticleView";
import ShareMenu from "./article-view/ShareMenu";
import ToggleIconButton from "./article-view/ToggleIconButton";
import FetchFullContentArea from "./article-view/FetchFullContentArea";
import ArticleNavigation from "./article-view/ArticleNavigation";
import FilterMenu from "./article-view/FilterMenu";
import GlobalFilterMenu from "./article-view/GlobalFilterMenu";
import ImageGallery from "./article-view/ImageGallery";
import SnoozeMenu from "./article-view/SnoozeMenu";
import SelectionExcludePopup, { useSelectionExclude } from "./article-view/SelectionExcludePopup";

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  small: "text-[14px] leading-[1.75]",
  medium: "text-[16px] leading-[1.9]",
  large: "text-[19px] leading-[2.0]",
};

const FONT_FAMILY_CLASSES: Record<FontFamily, string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

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
  showToast?: (msg: string) => void;
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  feeds?: Feed[];
  onSaveFilter?: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
  globalFilter?: KeywordFilter | null;
  onSaveGlobalFilter?: (filter: KeywordFilter | null) => void;
  onSnooze?: (id: string, durationMs: number) => void;
  query?: string;
  onSetQuery?: (q: string) => void;
  note?: string;
  onSetNote?: (articleId: string, text: string) => void;
  onDeleteNote?: (articleId: string) => void;
  onSetAuthorFilter?: (author: string) => void;
  onAutoMarkRead?: (articleId: string) => void;
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
  showToast,
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
  feeds,
  onSaveFilter,
  globalFilter,
  onSaveGlobalFilter,
  onSnooze,
  query = "",
  onSetQuery,
  note,
  onSetNote,
  onDeleteNote,
  onSetAuthorFilter,
  onAutoMarkRead,
}: Props) {
  const {
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    theme,
    focusMode,
    toggleFocusMode: onToggleFocusMode,
    autoReadEnabled,
    toggleAutoRead: onToggleAutoRead,
    autoReadThreshold,
    cycleAutoReadThreshold: onCycleAutoReadThreshold,
  } = useReaderSettings();
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

  // AI 評価ボタンの選択状態＋原文/翻訳タブ切替（記事切り替え時にリセット）
  const {
    summaryRating,
    setSummaryRating,
    translateRating,
    setTranslateRating,
    contentTab,
    setContentTab,
  } = useArticleAiRatings({ articleId: article?.id, translateResult });

  // リーダー表示設定（行間・コンテンツ幅・両端揃え）— localStorage で永続化
  const [lineHeight, setLineHeight] = useState<LineHeight>(() => {
    const stored = storageGet(STORAGE_KEYS.LINE_HEIGHT);
    return LINE_HEIGHT_CYCLE.includes(stored as LineHeight) ? (stored as LineHeight) : "normal";
  });
  const [contentWidth, setContentWidth] = useState<ContentWidth>(() => {
    const stored = storageGet(STORAGE_KEYS.CONTENT_WIDTH);
    return CONTENT_WIDTH_CYCLE.includes(stored as ContentWidth)
      ? (stored as ContentWidth)
      : "medium";
  });
  const [textJustify, setTextJustify] = useState<boolean>(() => {
    return storageGet(STORAGE_KEYS.TEXT_JUSTIFY) === "true";
  });

  function handleCycleLineHeight() {
    const next = cycleLineHeight(lineHeight);
    setLineHeight(next);
    storageSet(STORAGE_KEYS.LINE_HEIGHT, next);
  }

  function handleCycleContentWidth() {
    const next = cycleContentWidth(contentWidth);
    setContentWidth(next);
    storageSet(STORAGE_KEYS.CONTENT_WIDTH, next);
  }

  function handleToggleJustify() {
    const next = !textJustify;
    setTextJustify(next);
    storageSet(STORAGE_KEYS.TEXT_JUSTIFY, String(next));
  }

  // メモ編集ステート（記事切り替え時にリセット）
  const { noteText, setNoteText, noteExpanded, setNoteExpanded, handleNoteBlur } = useArticleNote({
    article,
    note,
    onSetNote,
    onDeleteNote,
  });

  // 読み上げ（TTS）
  const {
    supported: ttsSupported,
    isPlaying: ttsPlaying,
    isPaused: ttsPaused,
    rate: ttsRate,
    cycleRate: ttsCycleRate,
    speak,
    stop: ttsStop,
  } = useSpeechSynthesis();
  // 記事切り替え時に読み上げ停止
  useEffect(() => {
    ttsStop();
    // ttsStop は安定参照なので deps から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  // スクロール位置の保存・復元
  const mainRef = useRef<HTMLElement>(null);

  // 全文取得・AI 要約・スクロールショートカット (v / a / Space / Shift+Space)
  // useSyncedRef で最新値を参照し、リスナーの再登録を回避する
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
    translateResult,
    translateLoading,
    doTranslate,
    resetTranslate,
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
        if (s.translateResult) {
          s.resetTranslate();
        } else if (!s.translateLoading && !s.fetching) {
          void s.doTranslate(s.articleLink, s.articleId!, s.storedContent ?? undefined);
        }
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
  const contentRef = useRef<HTMLDivElement>(null);
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
  } = useImageDownload(article, resolvedOgImage, contentRef, showToast);

  // ダウンロード確認モーダル表示中はリサイズバーを無効化する（Issue #81）
  usePopupLock(confirmingDownload);

  const embedInfo = article?.link ? extractEmbedInfo(article.link) : null;

  // 取得済みコンテンツ: フェッチ結果 > キャッシュ > RSS 本文
  const rawContent = storedContent ?? article?.content ?? null;
  // useMemo で参照安定化。毎レンダー processContent が走ると dangerouslySetInnerHTML が
  // innerHTML を再代入し、highlight.js が付けた .hljs class ごと DOM が吹き飛ぶ（Issue #83）。
  const processedContent = useMemo(
    () =>
      rawContent
        ? embedInfo
          ? stripIframes(rawContent)
          : processContent(rawContent, theme)
        : null,
    [rawContent, embedInfo, theme],
  );

  // 記事本文の全画像 URL を抽出（重複除去）— 2枚以上あれば末尾ギャラリーに表示
  const galleryImages = useMemo(
    () => (processedContent ? collectImageUrlsFromHtml(processedContent) : []),
    [processedContent],
  );

  // TTS キーボードショートカット (P): 読み上げ開始/停止
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

  // PC 用: 画像スライダーに prev/next ボタンと wheel リダイレクトを注入する
  useSliderGallery(contentRef, processedContent);

  // X (Twitter) ツイート iframe を postMessage で動的リサイズ
  // platform.twitter.com から {"method":"twttr.resize","params":{"height":N}} が届くたびに
  // 対応する iframe の高さを更新する
  useEventListener("message", (e: MessageEvent) => {
    if (e.origin !== "https://platform.twitter.com") return;
    let data: unknown;
    try {
      data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const d = data as Record<string, unknown>;
    if (d.method !== "twttr.resize") return;
    const params = d.params as Record<string, unknown> | undefined;
    if (typeof params?.height !== "number") return;
    const iframes = contentRef.current?.querySelectorAll<HTMLIFrameElement>(
      ".tweet-embed-wrapper iframe",
    );
    if (!iframes) return;
    for (const iframe of iframes) {
      if (iframe.contentWindow === e.source) {
        iframe.style.height = `${params.height}px`;
        break;
      }
    }
  });

  // 記事が変わったらプログレスバーを保存済み進捗で初期化（AI 状態は useArticleAi が担当）
  useEffect(() => {
    if (progressBarRef.current) {
      const pct = article?.id ? (loadProgress(article.id)?.progress ?? 0) : 0;
      progressBarRef.current.style.width = `${pct}%`;
      progressBarRef.current.style.display = pct > 0 ? "" : "none";
    }
  }, [article?.id]);

  // 自動既読の最新設定を ref で参照（IntersectionObserver のコールバックが stale にならないように）
  const autoReadEnabledRef = useSyncedRef(autoReadEnabled);
  const autoReadThresholdRef = useSyncedRef(autoReadThreshold);
  const onAutoMarkReadRef = useSyncedRef(onAutoMarkRead);
  const articleIdRef = useSyncedRef(article?.id);

  // IntersectionObserver で読書進捗を追跡し、プログレスバーをリアルタイム更新
  useReadingProgress({
    articleId: article?.id,
    contentRef,
    onProgressChange: (pct) => {
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct}%`;
        progressBarRef.current.style.display = pct > 0 ? "" : "none";
      }
      // 自動既読: 閾値以上までスクロールしたら既読マーク（markRead は冪等）
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

  // 本文内スタンドアロンリンクに OGP プレビューカードを注入
  useContentLinkPreviews(contentRef, processedContent);

  // シンタックスハイライト（highlight.js）と数式レンダリング（KaTeX）
  useSyntaxHighlight(contentRef, processedContent);
  useMathRender(contentRef, processedContent);

  // 検索クエリのハイライト — query / processedContent が変わるたびに DOM に <mark> を注入
  useArticleHighlight({ contentRef, query, processedContent });

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
  const filterFeed =
    feeds && onSaveFilter ? feeds.find((f) => f.id === article.feedHash) : undefined;

  function handleScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget;
    const scrollable = el.scrollHeight - el.clientHeight;
    const progress = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 0;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`;
      progressBarRef.current.style.display = progress > 0 ? "" : "none";
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
      <div className="max-w-2xl mx-auto px-4 py-6 lg:px-10 lg:py-12">
        {/* メタ行 + アクション行（常に2段構成） */}
        <div className="mb-5 text-[11px] text-text-muted flex flex-col gap-y-2">
          {/* メタ情報: 戻るボタン + 日付/著者/リンク/読了時間 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {onMobileBack && (
              <button
                onClick={onMobileBack}
                className="lg:hidden -ml-1 mr-1 p-1.5 text-text-muted hover:text-text-strong transition-colors flex-shrink-0"
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
            {article.author &&
              (onSetAuthorFilter ? (
                <button
                  onClick={() => onSetAuthorFilter(article.author!)}
                  title={`「${article.author}」の記事に絞り込む`}
                  className="tracking-[0.04em] text-text-muted hover:text-text-default transition-colors duration-150 text-left"
                >
                  {article.author}
                </button>
              ) : (
                <span className="tracking-[0.04em] text-text-muted">{article.author}</span>
              ))}
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
                        showToast?.(`「${cat}」は既に除外フィルターに登録されています`);
                        return;
                      }
                      void onSaveFilter(filterFeed.id, {
                        include: filterFeed.filter?.include ?? [],
                        exclude: [...existingExclude, cat],
                        matchCategories: true,
                      }).then(() => showToast?.(`「${cat}」を除外カテゴリに追加しました`));
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
          </div>

          {/* アクションボタン群: 右寄せ flex-wrap */}
          <div
            data-print="hide"
            className="flex flex-wrap justify-end items-center gap-2 lg:gap-1.5 lg:flex-nowrap"
          >
            {/* フォントサイズ切り替え */}
            <div className="flex items-center gap-0.5 mr-1">
              {FONT_SIZE_CYCLE.map((size) => (
                <button
                  key={size}
                  onClick={() => onChangeFontSize(size)}
                  title={size === "small" ? "小" : size === "medium" ? "中" : "大"}
                  className={`px-1.5 py-0.5 rounded transition-colors duration-150 ${
                    fontSize === size ? "text-text-strong" : "text-text-faint hover:text-text-muted"
                  }`}
                  style={{
                    fontSize: size === "small" ? "10px" : size === "medium" ? "12px" : "14px",
                    lineHeight: 1,
                  }}
                >
                  A
                </button>
              ))}
            </div>

            {/* フォントファミリー切り替え */}
            <div className="flex items-center gap-0.5 mr-1">
              {FONT_FAMILY_CYCLE.map((family) => (
                <button
                  key={family}
                  onClick={() => onChangeFontFamily(family)}
                  title={FONT_FAMILY_LABELS[family]}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors duration-150 ${
                    fontFamily === family
                      ? "text-text-strong"
                      : "text-text-faint hover:text-text-muted"
                  } ${
                    family === "sans"
                      ? "font-sans"
                      : family === "serif"
                        ? "font-serif"
                        : "font-mono"
                  }`}
                  style={{ lineHeight: 1 }}
                >
                  {family === "sans" ? "ゴ" : family === "serif" ? "明" : "等"}
                </button>
              ))}
            </div>

            {/* 行間切り替え */}
            <button
              onClick={handleCycleLineHeight}
              title={`行間: ${LINE_HEIGHT_LABELS[lineHeight]}`}
              className="px-1.5 py-0.5 rounded text-[10px] transition-colors duration-150 text-text-faint hover:text-text-muted"
              style={{ lineHeight: 1 }}
            >
              {LINE_HEIGHT_LABELS[lineHeight]}
            </button>

            {/* コンテンツ幅切り替え */}
            <button
              onClick={handleCycleContentWidth}
              title={`幅: ${CONTENT_WIDTH_LABELS[contentWidth]}`}
              className="px-1.5 py-0.5 rounded text-[10px] transition-colors duration-150 text-text-faint hover:text-text-muted"
              style={{ lineHeight: 1 }}
            >
              {CONTENT_WIDTH_LABELS[contentWidth]}
            </button>

            {/* 両端揃えトグル */}
            <button
              onClick={handleToggleJustify}
              title={textJustify ? "両端揃え: ON" : "両端揃え: OFF"}
              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors duration-150 ${
                textJustify ? "text-text-strong" : "text-text-faint hover:text-text-muted"
              }`}
              style={{ lineHeight: 1 }}
            >
              均等
            </button>

            {/* 自動既読トグル */}
            <button
              onClick={onToggleAutoRead}
              title={
                autoReadEnabled
                  ? `自動既読: ON (${autoReadThreshold}% でスクロール既読)`
                  : "自動既読: OFF"
              }
              aria-label={
                autoReadEnabled
                  ? `自動既読を OFF にする（現在 ${autoReadThreshold}% で既読マーク）`
                  : "自動既読を ON にする"
              }
              aria-pressed={autoReadEnabled}
              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors duration-150 ${
                autoReadEnabled ? "text-text-strong" : "text-text-faint hover:text-text-muted"
              }`}
              style={{ lineHeight: 1 }}
            >
              自動既読
            </button>

            {/* 自動既読の閾値サイクルボタン（ON のときのみ表示） */}
            {autoReadEnabled && (
              <button
                onClick={onCycleAutoReadThreshold}
                title={`自動既読の閾値: ${autoReadThreshold}% — クリックで次の閾値に切替`}
                aria-label={`自動既読の閾値を切替（現在 ${autoReadThreshold}%）`}
                className="px-1.5 py-0.5 rounded text-[10px] transition-colors duration-150 text-text-strong hover:bg-surface-subtle"
                style={{ lineHeight: 1 }}
              >
                {autoReadThreshold}%
              </button>
            )}

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
                  className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
                    aiResult
                      ? "border-ink bg-ink text-ink-text"
                      : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
                  }`}
                >
                  {aiLoading ? "…" : "要約"}
                </button>
                <button
                  onClick={() => {
                    if (translateResult) {
                      resetTranslate();
                      return;
                    }
                    if (article.link) {
                      doTranslate(article.link, article.id, storedContent ?? undefined);
                    }
                  }}
                  disabled={translateLoading || fetching}
                  title="AI 翻訳（日本語）(z)"
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
                onClick={() => {
                  if (ttsPlaying || ttsPaused) {
                    ttsStop();
                  } else {
                    const text = [
                      article.title,
                      toPlainText(processedContent ?? article.summary ?? ""),
                    ]
                      .filter(Boolean)
                      .join("\n\n");
                    speak(text);
                  }
                }}
                title={ttsPlaying || ttsPaused ? "読み上げを停止" : "読み上げ (P)"}
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
                className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 text-[10px] font-medium tabular-nums leading-none ${
                  ttsPlaying || ttsPaused
                    ? "text-ink hover:text-text-muted"
                    : "text-text-faint hover:text-text-muted"
                }`}
              >
                {`${ttsRate}x`}
              </button>
            )}

            {article.link && showToast && (
              <ShareMenu
                article={article}
                showToast={showToast}
                feed={feeds?.find((f) => f.id === article.feedHash)}
                contentHtml={storedContent ?? undefined}
              />
            )}
            {filterFeed && onSaveFilter && (
              <FilterMenu
                article={article}
                feed={filterFeed}
                onSaveFilter={onSaveFilter}
                showToast={showToast}
              />
            )}
            {onSaveGlobalFilter && (
              <GlobalFilterMenu
                article={article}
                globalFilter={globalFilter ?? null}
                onSaveGlobalFilter={onSaveGlobalFilter}
                showToast={showToast}
              />
            )}
            {onSnooze && (
              <SnoozeMenu
                articleId={article.id}
                onSnooze={onSnooze}
                onSelectNext={onSelectNext}
                showToast={showToast}
              />
            )}

            {/* 後で読む / ブックマーク / いいね — 排他スイッチ */}
            <div className="flex items-center rounded-full border border-border-default overflow-hidden">
              <button
                onClick={() => {
                  if (!isInReadingList) {
                    if (isBookmarked) onToggleBookmark(article.id);
                    if (isLiked) onToggleLike(article.id);
                  }
                  onToggleReadingList(article.id);
                  showToast?.(isInReadingList ? "後で読むから削除" : "後で読むに追加");
                }}
                title={isInReadingList ? "後で読むから削除" : "後で読む (T)"}
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
                  if (!isBookmarked) {
                    if (isInReadingList) onToggleReadingList(article.id);
                    if (isLiked) onToggleLike(article.id);
                  }
                  onToggleBookmark(article.id);
                }}
                title={isBookmarked ? "ブックマーク解除 (b)" : "ブックマーク (b)"}
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
                  if (!isLiked) {
                    if (isInReadingList) onToggleReadingList(article.id);
                    if (isBookmarked) onToggleBookmark(article.id);
                  }
                  onToggleLike(article.id);
                }}
                title={isLiked ? "いいね解除 (I)" : "いいね (I)"}
                className={`px-2.5 py-1.5 transition-colors duration-200 [&>svg]:w-[14px] [&>svg]:h-[14px] lg:[&>svg]:w-[12px] lg:[&>svg]:h-[12px] ${
                  isLiked
                    ? "bg-rose-400 text-white"
                    : "text-text-faint hover:text-rose-400 hover:bg-surface-hover"
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
            <button
              onClick={onToggleFocusMode}
              title={focusMode ? "フォーカスモード終了 (\\)" : "フォーカスモード (\\)"}
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

        {/* タイトル */}
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

        {/* メディア埋め込み */}
        {embedInfo && embedInfo.type === "video" && (
          <div
            className="relative mb-8"
            style={{ paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "8px" }}
          >
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embedInfo.embedUrl}
              title={article.title}
              allow={embedInfo.allow}
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              style={{ border: 0, borderRadius: "8px" }}
            />
          </div>
        )}
        {embedInfo && embedInfo.type === "audio" && (
          <div className="mb-8 rounded-xl overflow-hidden">
            <iframe
              src={embedInfo.embedUrl}
              title={article.title}
              allow={embedInfo.allow}
              height={embedInfo.audioHeight ?? 152}
              style={{ border: 0, width: "100%", borderRadius: "12px" }}
            />
          </div>
        )}

        {/* AI 要約パネル */}
        {aiResult && (
          <div className="mb-8 px-4 py-3 rounded-lg border border-border-default bg-surface-base animate-fade-up">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint">AI 要約</p>
              <div className="flex items-center gap-1">
                {(["good", "neutral", "bad"] as const).map((rating) => (
                  <button
                    key={rating}
                    title={rating === "good" ? "良い" : rating === "neutral" ? "普通" : "悪い"}
                    onClick={() => {
                      if (summaryRating === rating) return;
                      setSummaryRating(rating);
                      if (article) {
                        onEngagement?.(
                          article.id,
                          article.feedHash,
                          "ai_feedback",
                          `${rating}:summary`,
                        );
                      }
                    }}
                    className={`text-[14px] leading-none transition-all duration-150 ${
                      summaryRating === rating
                        ? "opacity-100 scale-110"
                        : summaryRating !== null
                          ? "opacity-25"
                          : "opacity-40 hover:opacity-100"
                    }`}
                  >
                    {rating === "good" ? "👍" : rating === "neutral" ? "😐" : "👎"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[14px] leading-[1.8] text-text-default">{aiResult}</p>
          </div>
        )}
        {aiError && <p className="mb-6 text-[11px] text-rose-400">{aiError}</p>}

        {translateError && <p className="mb-6 text-[11px] text-rose-400">{translateError}</p>}

        {/* OGP 画像 (埋め込みなし) */}
        {!embedInfo && (article.ogImage ?? resolvedOgImage) && (
          <img
            src={`/api/image-proxy?url=${encodeURIComponent((article.ogImage ?? resolvedOgImage)!)}`}
            alt=""
            className="w-full rounded-lg object-contain bg-surface-subtle mb-6 aspect-video"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        {/* 原文 / 翻訳タブ（翻訳結果がある場合のみ表示） */}
        {translateResult && processedContent && (
          <div className="mb-4 flex items-center gap-1 border-b border-border-default">
            <button
              onClick={() => setContentTab("original")}
              className={`px-3 py-2 text-[11px] tracking-[0.08em] uppercase transition-colors duration-150 border-b-2 -mb-px ${
                contentTab === "original"
                  ? "border-ink text-text-strong"
                  : "border-transparent text-text-muted hover:text-text-default"
              }`}
            >
              原文
            </button>
            <button
              onClick={() => setContentTab("translate")}
              className={`px-3 py-2 text-[11px] tracking-[0.08em] uppercase transition-colors duration-150 border-b-2 -mb-px ${
                contentTab === "translate"
                  ? "border-ink text-text-strong"
                  : "border-transparent text-text-muted hover:text-text-default"
              }`}
            >
              翻訳
            </button>
            {contentTab === "translate" && (
              <div className="ml-auto flex items-center gap-1 pb-1">
                {(["good", "neutral", "bad"] as const).map((rating) => (
                  <button
                    key={rating}
                    title={rating === "good" ? "良い" : rating === "neutral" ? "普通" : "悪い"}
                    onClick={() => {
                      if (translateRating === rating) return;
                      setTranslateRating(rating);
                      if (article) {
                        onEngagement?.(
                          article.id,
                          article.feedHash,
                          "ai_feedback",
                          `${rating}:translate`,
                        );
                      }
                    }}
                    className={`text-[14px] leading-none transition-all duration-150 ${
                      translateRating === rating
                        ? "opacity-100 scale-110"
                        : translateRating !== null
                          ? "opacity-25"
                          : "opacity-40 hover:opacity-100"
                    }`}
                  >
                    {rating === "good" ? "👍" : rating === "neutral" ? "😐" : "👎"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 本文 */}
        {contentTab === "translate" && translateResult ? (
          translateResult.isHtml ? (
            <div
              className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
              style={{
                ...getLineHeightStyle(lineHeight),
                ...getContentWidthStyle(contentWidth),
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(translateResult.text) }}
            />
          ) : (
            <p
              className={`article-content whitespace-pre-wrap ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
              style={{
                ...getLineHeightStyle(lineHeight),
                ...getContentWidthStyle(contentWidth),
              }}
            >
              {translateResult.text}
            </p>
          )
        ) : processedContent ? (
          <div
            ref={contentRef}
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
            style={{
              ...getLineHeightStyle(lineHeight),
              ...getContentWidthStyle(contentWidth),
            }}
            // dangerouslySetInnerHTML の中は React がテキストノードを管理しないため
            // Google 翻訳の <font> 注入と React 調停が衝突しない。
            // html 要素の translate="no" を上書きして翻訳を許可する。
            translate="yes"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : article.summary ? (
          <p
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
            style={{
              ...getLineHeightStyle(lineHeight),
              ...getContentWidthStyle(contentWidth),
            }}
          >
            {article.summary}
          </p>
        ) : !embedInfo ? (
          <div className="text-center py-12">
            <p className="text-[12px] text-text-faint mb-4 tracking-[0.04em]">
              本文のプレビューはありません
            </p>
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-text-soft hover:text-text-default tracking-[0.06em] underline-offset-4 hover:underline transition-all duration-200"
              >
                元記事を開く
              </a>
            )}
          </div>
        ) : null}

        {/* 画像一覧（2枚以上あれば記事末尾に表示） */}
        {galleryImages.length >= 2 && <ImageGallery images={galleryImages} />}

        {/* 全文取得ボタン */}
        {canFetch && (
          <FetchFullContentArea
            articleId={article.id}
            articleLink={article.link!}
            feedHash={article.feedHash}
            fetching={fetching}
            fetchError={fetchError}
            onFetch={fetchFullContent}
            onEngagement={onEngagement}
          />
        )}

        {/* メモパネル */}
        {onSetNote && (noteExpanded || noteText) && (
          <div className="mt-10 mb-2">
            <div className="flex items-center gap-1.5 mb-2">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-faint"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint">メモ</p>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onBlur={handleNoteBlur}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setNoteText(note ?? "");
                  if (!note) setNoteExpanded(false);
                  e.currentTarget.blur();
                }
              }}
              placeholder="この記事についてのメモ..."
              className="w-full min-h-[80px] resize-y bg-surface-subtle border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-text-default placeholder:text-text-faint focus:outline-none focus:border-border-default transition-colors"
              maxLength={2000}
            />
            <div className="flex items-center justify-between mt-1">
              {noteText !== (note ?? "") ? (
                <p className="text-[10px] text-text-faint">フォーカスを外すと自動保存</p>
              ) : (
                <span />
              )}
              {!noteText.trim() && noteExpanded && !note && (
                <button
                  onClick={() => setNoteExpanded(false)}
                  className="text-[11px] text-text-faint hover:text-text-muted transition-colors"
                >
                  キャンセル
                </button>
              )}
            </div>
          </div>
        )}

        {/* 前後記事ナビゲーション */}
        <ArticleNavigation
          prevArticle={prevArticle}
          nextArticle={nextArticle}
          onSelectPrev={onSelectPrev}
          onSelectNext={onSelectNext}
        />
      </div>

      {/* ダウンロード確認モーダル */}
      {confirmingDownload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={cancelDownload}
        >
          <div
            className="bg-surface-elevated border border-border-default rounded-xl p-6 shadow-xl max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-text-strong text-[14px] font-medium mb-2">
              {isAlreadyDownloaded ? "再ダウンロード" : "画像をダウンロード"}
            </p>
            <p className="text-text-soft text-[13px] mb-5">
              {isAlreadyDownloaded
                ? "この記事の画像はすでに保存済みです。再度ダウンロードしますか？"
                : "記事内の画像をすべてダウンロードします。よろしいですか？"}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelDownload}
                className="px-4 py-1.5 rounded-lg text-[13px] text-text-muted hover:text-text-default transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => void confirmDownload()}
                className="px-4 py-1.5 rounded-lg text-[13px] bg-ink hover:bg-ink-hover text-ink-text transition-colors"
              >
                ダウンロード
              </button>
            </div>
          </div>
        </div>
      )}
      {selectionPopup && article.link && (
        <SelectionExcludePopup
          popup={selectionPopup}
          article={{ title: article.title, link: article.link }}
          globalFilter={globalFilter ?? null}
          onSaveGlobalFilter={onSaveGlobalFilter ?? undefined}
          showToast={showToast}
          onClose={clearSelectionPopup}
        />
      )}
    </main>
  );
}
