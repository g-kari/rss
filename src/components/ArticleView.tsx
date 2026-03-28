"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Article, Feed, FontSize, AiMode, KeywordFilter } from "../types";
import type { Theme } from "../hooks/useUIState";
import FeedFilterModal from "./FeedFilterModal";
import { readingTime } from "../lib/article-utils";
import { extractEmbedInfo, processContent, stripIframes } from "../lib/embed-utils";
import { useArticleContent } from "../hooks/useArticleContent";
import { useArticleAi } from "../hooks/useArticleAi";
import { useImageDownload } from "../hooks/useImageDownload";
import { useContentLinkPreviews } from "../hooks/useContentLinkPreviews";

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  small: "text-[14px] leading-[1.75]",
  medium: "text-[16px] leading-[1.9]",
  large: "text-[19px] leading-[2.0]",
};
const FONT_SIZE_CYCLE: FontSize[] = ["small", "medium", "large"];

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
    action: "fetch_full" | "open_original",
  ) => void;
  onMobileBack?: () => void;
  fontSize?: FontSize;
  onChangeFontSize?: (size: FontSize) => void;
  showToast?: (msg: string) => void;
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  theme?: Theme;
  feeds?: Feed[];
  onSaveFilter?: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
}

const SHORT_CONTENT_THRESHOLD = 400;

// --- 共通 SVG アイコン ---

const SpinIcon = () => (
  <svg
    className="w-3.5 h-3.5 animate-spin"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const DownloadIcon = () => (
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
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const ExternalLinkIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    className={`w-[${size}px] h-[${size}px]`}
    width={size}
    height={size}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
);

const ChevronLeftSmall = ({ width = 12, height = 12 }: { width?: number; height?: number }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 2L4 6l4 4" />
  </svg>
);

const ChevronRightSmall = ({ width = 12, height = 12 }: { width?: number; height?: number }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 2l4 4-4 4" />
  </svg>
);

// --- ShareMenu コンポーネント ---

interface ShareMenuProps {
  article: Article;
  showToast: (msg: string) => void;
}

function ShareMenu({ article, showToast }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const itemCls =
    "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="共有 (c)"
        className={`transition-colors duration-200 ${open ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
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
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
          <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[140px]">
          {typeof navigator.share === "function" && (
            <button
              onClick={() => {
                setOpen(false);
                navigator.share({ url: article.link!, title: article.title }).catch(() => {});
              }}
              className={itemCls}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              システムで共有
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              window.open(
                `https://x.com/intent/tweet?url=${encodeURIComponent(article.link!)}&text=${encodeURIComponent(article.title)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
            className={itemCls}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.833L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X でシェア
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigator.clipboard
                .writeText(`${article.title}\n${article.link!}`)
                .then(() => {
                  showToast("コピーしました。Slack を開きます");
                  window.open("slack://open", "_blank", "noopener,noreferrer");
                })
                .catch(() => {
                  showToast("コピーに失敗しました");
                });
            }}
            className={itemCls}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            Slack 用にコピー
          </button>
          <button
            onClick={() => {
              setOpen(false);
              window.open(
                `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(article.link!)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
            className={itemCls}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            LINE でシェア
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigator.clipboard
                .writeText(`${article.title}\n${article.link!}`)
                .then(() => {
                  showToast("タイトルと URL をコピーしました");
                })
                .catch(() => {
                  showToast("コピーに失敗しました");
                });
            }}
            className={itemCls}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            タイトル + URL をコピー
          </button>
        </div>
      )}
    </div>
  );
}

// --- FilterMenu コンポーネント ---

interface FilterMenuProps {
  article: Article;
  feed: Feed;
  onSaveFilter: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
  showToast?: (msg: string) => void;
}

/** XML キーを日本語ラベルに変換する */
function metaLabel(key: string): string {
  const map: Record<string, string> = {
    "dc:corp": "企業",
    "dc:creator": "著者",
    "dc:subject": "テーマ",
    "dc:publisher": "出版社",
    "dc:type": "種別",
    "dc:rights": "権利",
    business_form: "業種",
    service: "サービス",
    industry: "業界",
    category: "カテゴリ",
    tag: "タグ",
    source: "情報源",
    department: "部署",
    genre: "ジャンル",
    region: "地域",
    prefecture: "都道府県",
    country: "国",
  };
  return map[key] ?? key.replace(/^[a-z]+:/i, "");
}

function FilterMenu({ article, feed, onSaveFilter, showToast }: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const hasFilter =
    feed.filter && (feed.filter.include.length > 0 || feed.filter.exclude.length > 0);

  async function handleExclude(value: string) {
    setOpen(false);
    const existingExclude = feed.filter?.exclude ?? [];
    if (existingExclude.includes(value)) {
      showToast?.("既に除外キーワードに登録されています");
      return;
    }
    const newFilter: KeywordFilter = {
      include: feed.filter?.include ?? [],
      exclude: [...existingExclude, value],
      matchCategories: feed.filter?.matchCategories,
    };
    try {
      await onSaveFilter(feed.id, newFilter);
      showToast?.(`「${value}」を除外キーワードに追加しました`);
    } catch {
      showToast?.("フィルターの保存に失敗しました");
    }
  }

  // 除外候補を動的に生成する
  const excludeOptions: { label: string; value: string }[] = [
    { label: "この記事", value: article.title },
    ...(article.author ? [{ label: `著者「${article.author}」`, value: article.author }] : []),
    ...(article.categories ?? []).map((cat) => ({ label: `カテゴリ「${cat}」`, value: cat })),
    ...(article.metadata ?? []).map((m) => ({
      label: `${metaLabel(m.key)}「${m.value}」`,
      value: m.value,
    })),
  ];

  const itemCls =
    "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left";

  const XIcon = (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="フィルター設定"
        className={`transition-colors duration-200 ${open || hasFilter ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
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
          <path d="M3 4h18M7 8h10M11 12h2M9 16h6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[200px] max-h-[320px] overflow-y-auto">
          <button
            onClick={() => {
              setOpen(false);
              setModalOpen(true);
            }}
            className={itemCls}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
            >
              <path d="M3 4h18M7 8h10M11 12h2M9 16h6" />
            </svg>
            キーワードフィルター設定
          </button>
          {excludeOptions.length > 0 && (
            <div className="border-t border-border-subtle">
              <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                除外する
              </p>
              {excludeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => void handleExclude(opt.value)}
                  className={itemCls}
                >
                  {XIcon}
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {modalOpen && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setModalOpen(false)}
          onSave={(filter) => onSaveFilter(feed.id, filter)}
        />
      )}
    </div>
  );
}

/** target から currentTarget まで祖先を遡り、横スクロール可能な要素があれば true を返す */
function hasScrollableAncestor(
  target: EventTarget | null,
  currentTarget: EventTarget | null,
): boolean {
  let node = target as Element | null;
  while (node && node !== currentTarget) {
    const ox = getComputedStyle(node).overflowX;
    if ((ox === "auto" || ox === "scroll") && node.scrollWidth > node.clientWidth) return true;
    node = node.parentElement;
  }
  return false;
}

/** スワイプ・ホイール・マウスドラッグによる前後記事ナビゲーションのジェスチャー処理 */
function useGestureNav({
  onSelectPrev,
  onSelectNext,
}: {
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartXRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef<{ x: number; timer: ReturnType<typeof setTimeout> | null }>({
    x: 0,
    timer: null,
  });

  function handleWheel(e: React.WheelEvent) {
    if (hasScrollableAncestor(e.target, e.currentTarget)) return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.5) return;
    const state = wheelDeltaRef.current;
    state.x += e.deltaX;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.x = 0;
    }, 400);
    if (state.x > 150 && onSelectNext) {
      state.x = 0;
      onSelectNext();
    } else if (state.x < -150 && onSelectPrev) {
      state.x = 0;
      onSelectPrev();
    }
  }

  function handleNavMouseDown(e: React.MouseEvent) {
    mouseStartXRef.current = e.clientX;
  }

  function handleNavMouseUp(e: React.MouseEvent) {
    if (mouseStartXRef.current === null) return;
    const dx = e.clientX - mouseStartXRef.current;
    mouseStartXRef.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0 && onSelectNext) onSelectNext();
    else if (dx > 0 && onSelectPrev) onSelectPrev();
  }

  function handleNavMouseLeave() {
    mouseStartXRef.current = null;
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (hasScrollableAncestor(e.target, e.currentTarget)) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    // 水平方向が縦スクロールより優位で、かつ閾値を超えた場合のみ遷移
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && onSelectNext) onSelectNext();
    else if (dx > 0 && onSelectPrev) onSelectPrev();
  }

  return {
    handleWheel,
    handleNavMouseDown,
    handleNavMouseUp,
    handleNavMouseLeave,
    handleTouchStart,
    handleTouchEnd,
  };
}

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
  fontSize = "medium",
  onChangeFontSize,
  showToast,
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
  theme = "light",
  feeds,
  onSaveFilter,
}: Props) {
  const { storedContent, fetching, fetchError, fetchFullContent, resolvedOgImage } =
    useArticleContent(article?.id, article?.link, article?.ogImage);

  const { aiResult, aiLoading, aiError, doRunAi, resetAi } = useArticleAi(article?.id);

  // 翻訳結果を本文として表示するフラグ
  const [showTranslated, setShowTranslated] = useState(false);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const {
    handleWheel,
    handleNavMouseDown,
    handleNavMouseUp,
    handleNavMouseLeave,
    handleTouchStart,
    handleTouchEnd,
  } = useGestureNav({ onSelectPrev, onSelectNext });

  const { downloadAllImages, downloadingImages, imageDownloadProgress } = useImageDownload(
    article,
    resolvedOgImage,
    contentRef,
    showToast,
  );

  const embedInfo = article?.link ? extractEmbedInfo(article.link) : null;

  // 取得済みコンテンツ: フェッチ結果 > キャッシュ > RSS 本文
  const rawContent = storedContent ?? article?.content ?? null;
  const processedContent = rawContent
    ? embedInfo
      ? stripIframes(rawContent)
      : processContent(rawContent, theme)
    : null;

  // PC 用: 画像スライダーに prev/next ボタンと wheel リダイレクトを注入する
  const injectSliderControls = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const sliders = el.querySelectorAll<HTMLElement>(".rss-image-slider");
    sliders.forEach((slider) => {
      if (slider.closest(".rss-slider-wrapper")) return; // 二重注入を防止

      // スライダーを相対配置のラッパーで包む
      const wrapper = document.createElement("div");
      wrapper.className = "rss-slider-wrapper";
      wrapper.style.cssText = "position:relative;margin-bottom:1.25em";
      slider.style.marginBottom = "0";
      slider.parentNode!.insertBefore(wrapper, slider);
      wrapper.appendChild(slider);

      function makeNavBtn(dir: "prev" | "next") {
        const btn = document.createElement("button");
        const side = dir === "prev" ? "left:8px" : "right:8px";
        btn.setAttribute("aria-label", dir === "prev" ? "前の画像" : "次の画像");
        btn.style.cssText =
          `position:absolute;${side};top:50%;transform:translateY(-50%);` +
          `width:32px;height:32px;border-radius:50%;` +
          `background:rgba(0,0,0,0.45);color:white;border:none;cursor:pointer;` +
          `display:flex;align-items:center;justify-content:center;` +
          `opacity:0;transition:opacity 0.15s;z-index:1;padding:0;flex-shrink:0`;
        const path = dir === "prev" ? "M9 2L4 7l5 5" : "M5 2l5 5-5 5";
        btn.innerHTML =
          `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" ` +
          `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
          `<path d="${path}"/></svg>`;
        btn.addEventListener("click", () =>
          slider.scrollBy({
            left: dir === "prev" ? -slider.clientWidth : slider.clientWidth,
            behavior: "smooth",
          }),
        );
        wrapper.appendChild(btn);
        return btn;
      }

      const prevBtn = makeNavBtn("prev");
      const nextBtn = makeNavBtn("next");
      wrapper.addEventListener("mouseenter", () => {
        prevBtn.style.opacity = "1";
        nextBtn.style.opacity = "1";
      });
      wrapper.addEventListener("mouseleave", () => {
        prevBtn.style.opacity = "0";
        nextBtn.style.opacity = "0";
      });

      // マウスホイールの縦スクロールを横スクロールに変換（PC 操作性向上）
      slider.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          e.preventDefault();
          slider.scrollBy({
            left: e.deltaY > 0 ? slider.clientWidth : -slider.clientWidth,
            behavior: "smooth",
          });
        },
        { passive: false },
      );
    });
  }, []);

  // processedContent が変わるたびに再注入する（テーマ切り替え・全文取得・記事切り替えなど）
  useEffect(() => {
    injectSliderControls();
  }, [processedContent, injectSliderControls]);

  // 記事が変わったら AI 状態をリセット。日本語以外の記事は自動翻訳する（全文取得は行わない）
  // 記事が変わったらスクロール位置と翻訳表示状態をリセット（AI 状態は useArticleAi が担当）
  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = "0%";
      progressBarRef.current.style.display = "none";
    }
    setShowTranslated(false);
  }, [article?.id]);

  // 翻訳結果が届いたら本文を翻訳表示に切り替える
  useEffect(() => {
    if (aiResult?.mode === "translation") setShowTranslated(true);
  }, [aiResult]);

  // 本文内スタンドアロンリンクに OGP プレビューカードを注入
  useContentLinkPreviews(contentRef, processedContent);

  // シンタックスハイライト（highlight.js）
  useEffect(() => {
    if (!contentRef.current || !processedContent) return;
    const el = contentRef.current;
    let cancelled = false;
    import("highlight.js/lib/common").then(({ default: hljs }) => {
      if (cancelled || !el.isConnected) return;
      el.querySelectorAll<HTMLElement>("pre code:not(.hljs)").forEach((block) => {
        hljs.highlightElement(block);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [processedContent]);

  useEffect(() => {
    if (!contentRef.current || !processedContent) return;
    const el = contentRef.current;
    let cancelled = false;
    import("katex/contrib/auto-render").then(({ default: renderMathInElement }) => {
      if (cancelled || !el.isConnected) return;
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [processedContent, showTranslated]);

  if (!article) {
    return (
      <main className="h-full relative overflow-y-auto flex items-center justify-center bg-surface-base">
        {onMobileBack && (
          <button
            onClick={onMobileBack}
            className="lg:hidden absolute top-3 left-3 p-1.5 text-text-muted hover:text-text-strong transition-colors"
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
        <div className="text-center animate-fade-in">
          <svg
            className="w-8 h-8 mx-auto mb-3 text-text-faint"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <p className="text-[11px] tracking-[0.1em] text-text-faint">記事を選択</p>
        </div>
      </main>
    );
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
        {/* メタ行 + アクション行（スマホでは2行に折り返す） */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 text-[11px] text-text-muted">
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
          {article.author && (
            <span className="tracking-[0.04em] text-text-muted">{article.author}</span>
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

          {/* アクションボタン群（常にひとかたまりで右端に配置） */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* フォントサイズ切り替え */}
            {onChangeFontSize && (
              <div className="flex items-center gap-0.5 mr-1">
                {FONT_SIZE_CYCLE.map((size) => (
                  <button
                    key={size}
                    onClick={() => onChangeFontSize(size)}
                    title={size === "small" ? "小" : size === "medium" ? "中" : "大"}
                    className={`px-1.5 py-0.5 rounded transition-colors duration-150 ${
                      fontSize === size
                        ? "text-text-strong"
                        : "text-text-faint hover:text-text-muted"
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
            )}

            {/* AI ボタン */}
            {hasContent && (
              <div className="flex items-center gap-1 mr-1">
                {(["summary", "translation"] as AiMode[]).map((mode) => {
                  const isActive = aiResult?.mode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        if (isActive) {
                          resetAi();
                          if (mode === "translation") setShowTranslated(false);
                          return;
                        }
                        // サーバー側でコンテンツを取得して AI 処理
                        if (article.link) {
                          doRunAi(mode, article.link, article.id);
                        }
                      }}
                      disabled={!!aiLoading || fetching}
                      title={mode === "summary" ? "AI 要約" : "日本語翻訳"}
                      className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
                        isActive
                          ? "border-ink bg-ink text-ink-text"
                          : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
                      }`}
                    >
                      {aiLoading === mode ? "…" : mode === "summary" ? "要約" : "日本語"}
                    </button>
                  );
                })}
              </div>
            )}

            {hasImages && (
              <button
                onClick={() => {
                  void downloadAllImages();
                }}
                disabled={downloadingImages}
                title="記事内の画像をすべてダウンロード"
                className="text-text-faint hover:text-text-muted transition-colors duration-200 disabled:opacity-50 flex items-center gap-1"
              >
                {downloadingImages && imageDownloadProgress ? (
                  <span className="text-[10px] tabular-nums tracking-tight">
                    {imageDownloadProgress.done}/{imageDownloadProgress.total}
                  </span>
                ) : null}
                {downloadingImages ? <SpinIcon /> : <DownloadIcon />}
              </button>
            )}

            {article.link && showToast && <ShareMenu article={article} showToast={showToast} />}
            {filterFeed && onSaveFilter && (
              <FilterMenu
                article={article}
                feed={filterFeed}
                onSaveFilter={onSaveFilter}
                showToast={showToast}
              />
            )}

            <button
              onClick={() => onToggleReadingList(article.id)}
              title={isInReadingList ? "後で読むから削除" : "後で読む"}
              className={`transition-colors duration-200 ${
                isInReadingList
                  ? "text-text-default hover:text-text-muted"
                  : "text-text-faint hover:text-text-default"
              }`}
            >
              <svg
                width="14"
                height="14"
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
            <button
              onClick={() => onToggleBookmark(article.id)}
              title={isBookmarked ? "ブックマーク解除 (b)" : "ブックマーク (b)"}
              className={`transition-colors duration-200 ${
                isBookmarked
                  ? "text-bookmark hover:text-text-muted"
                  : "text-text-faint hover:text-bookmark"
              }`}
            >
              <svg
                width="14"
                height="14"
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
            <button
              onClick={() => onToggleLike(article.id)}
              title={isLiked ? "いいね解除" : "いいね"}
              className={`transition-colors duration-200 ${
                isLiked
                  ? "text-rose-400 hover:text-text-muted"
                  : "text-text-faint hover:text-rose-400"
              }`}
            >
              <svg
                width="14"
                height="14"
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
                <ChevronLeftSmall />
                <span className="text-[11px] text-text-faint truncate">{prevArticle.title}</span>
              </>
            )}
          </div>
          <div className="absolute inset-x-0 top-1/2 border-t border-border-subtle pointer-events-none" />
          <div className="flex-1 overflow-hidden flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {nextArticle && onSelectNext && (
              <>
                <span className="text-[11px] text-text-faint truncate">{nextArticle.title}</span>
                <ChevronRightSmall />
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

        {/* AI 要約パネル（翻訳は本文に統合するため非表示） */}
        {aiResult?.mode === "summary" && (
          <div className="mb-8 px-4 py-3 rounded-lg border border-border-default bg-surface-base animate-fade-up">
            <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint mb-2">AI 要約</p>
            <p className="text-[14px] leading-[1.8] text-text-default">{aiResult.text}</p>
          </div>
        )}
        {aiError && <p className="mb-6 text-[11px] text-rose-400">{aiError}</p>}

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

        {/* 翻訳/元文切り替えバー */}
        {aiResult?.mode === "translation" && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setShowTranslated(true)}
              className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 ${
                showTranslated
                  ? "border-ink bg-ink text-ink-text"
                  : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
              }`}
            >
              翻訳
            </button>
            <button
              onClick={() => setShowTranslated(false)}
              className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 ${
                !showTranslated
                  ? "border-ink bg-ink text-ink-text"
                  : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
              }`}
            >
              原文
            </button>
          </div>
        )}

        {/* 本文（翻訳表示中は翻訳テキストで置き換え） */}
        {showTranslated && aiResult?.mode === "translation" ? (
          <div className={`article-content ${FONT_SIZE_CLASSES[fontSize]}`}>
            {aiResult.text
              .split("\n")
              .map((line, i) => (line.trim() ? <p key={i}>{line}</p> : null))}
          </div>
        ) : processedContent ? (
          <div
            ref={contentRef}
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]}`}
            // dangerouslySetInnerHTML の中は React がテキストノードを管理しないため
            // Google 翻訳の <font> 注入と React 調停が衝突しない。
            // html 要素の translate="no" を上書きして翻訳を許可する。
            translate="yes"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : article.summary ? (
          <p className={`article-content ${FONT_SIZE_CLASSES[fontSize]}`}>{article.summary}</p>
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

        {/* 全文取得ボタン */}
        {canFetch && (
          <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  fetchFullContent(() => onEngagement?.(article.id, article.feedHash, "fetch_full"))
                }
                disabled={fetching}
                className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
              >
                {fetching ? (
                  <>
                    <SpinIcon />
                    取得中...
                  </>
                ) : (
                  <>
                    <DownloadIcon />
                    全文を取得
                  </>
                )}
              </button>
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onEngagement?.(article.id, article.feedHash, "open_original")}
                className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
              >
                <ExternalLinkIcon size={14} />
                元記事を開く
              </a>
            </div>
            {fetchError && <p className="text-[11px] text-rose-400">{fetchError}</p>}
          </div>
        )}

        {/* 前後記事ナビゲーション */}
        {(prevArticle || nextArticle) && (
          <div className="mt-12 pt-6 border-t border-border-subtle flex items-stretch gap-3">
            {prevArticle ? (
              <button
                onClick={onSelectPrev}
                className="flex-1 text-left px-4 py-3 rounded-lg border border-border-default hover:border-text-faint hover:bg-surface-subtle transition-all duration-200 group"
              >
                <span className="flex items-center gap-1 text-[10px] tracking-[0.08em] uppercase text-text-faint mb-1.5">
                  <ChevronLeftSmall />
                  前の記事
                </span>
                <span className="text-[12px] leading-snug text-text-muted group-hover:text-text-strong transition-colors duration-200 line-clamp-2">
                  {prevArticle.title}
                </span>
              </button>
            ) : (
              <div className="flex-1" />
            )}
            {nextArticle ? (
              <button
                onClick={onSelectNext}
                className="flex-1 text-right px-4 py-3 rounded-lg border border-border-default hover:border-text-faint hover:bg-surface-subtle transition-all duration-200 group"
              >
                <span className="flex items-center justify-end gap-1 text-[10px] tracking-[0.08em] uppercase text-text-faint mb-1.5">
                  次の記事
                  <ChevronRightSmall />
                </span>
                <span className="text-[12px] leading-snug text-text-muted group-hover:text-text-strong transition-colors duration-200 line-clamp-2">
                  {nextArticle.title}
                </span>
              </button>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
