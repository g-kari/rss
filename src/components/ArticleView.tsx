"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type {
  Article,
  EngagementAction,
  Feed,
  FontFamily,
  FontSize,
  KeywordFilter,
} from "../types";
import type { Theme } from "../hooks/useUIState";
import FeedFilterModal from "./FeedFilterModal";
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
import { useContentLinkPreviews } from "../hooks/useContentLinkPreviews";
import { usePortalMenu } from "../hooks/usePortalMenu";
import { loadJson, saveJson, STORAGE_KEYS } from "../lib/storage";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { useEventListener } from "../hooks/useEventListener";
import { toPlainText } from "../lib/html";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useGestureNav } from "../hooks/useGestureNav";

// ── スクロール位置の保存・復元 ─────────────────────────────────────────
const MAX_SCROLL_ENTRIES = 200;

function saveScrollPos(articleId: string, scrollTop: number): void {
  const map = loadJson<Record<string, number>>(STORAGE_KEYS.SCROLL_POSITIONS, {});
  map[articleId] = Math.round(scrollTop);
  const keys = Object.keys(map);
  if (keys.length > MAX_SCROLL_ENTRIES) {
    delete map[keys[0]];
  }
  saveJson(STORAGE_KEYS.SCROLL_POSITIONS, map);
}

function loadScrollPos(articleId: string): number {
  const map = loadJson<Record<string, number>>(STORAGE_KEYS.SCROLL_POSITIONS, {});
  return map[articleId] ?? 0;
}

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
  fontSize?: FontSize;
  onChangeFontSize?: (size: FontSize) => void;
  fontFamily?: FontFamily;
  onChangeFontFamily?: (family: FontFamily) => void;
  showToast?: (msg: string) => void;
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  theme?: Theme;
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
}

const SHORT_CONTENT_THRESHOLD = 400;

/** ShareMenu / FilterMenu で共有するドロップダウン項目の共通スタイル */
const MENU_ITEM_CLS =
  "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left";

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

const ChevronSmall = ({
  width = 12,
  height = 12,
  direction,
}: {
  width?: number;
  height?: number;
  direction: "left" | "right";
}) => (
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
    <path d={direction === "left" ? "M8 2L4 6l4 4" : "M4 2l4 4-4 4"} />
  </svg>
);

// --- EmptyArticleView コンポーネント ---

function EmptyArticleView({ onMobileBack }: { onMobileBack?: () => void }) {
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

// --- ShareMenu コンポーネント ---

interface ShareMenuProps {
  article: Article;
  showToast: (msg: string) => void;
}

function ShareMenu({ article, showToast }: ShareMenuProps) {
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();
  const menuRef = useRef<HTMLDivElement>(null);

  function handleSlackShare() {
    const text = `${article.title}\n${article.link!}`;
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("コピーしました。Slack を開きます");
        window.open("slack://open", "_blank", "noopener,noreferrer");
      })
      .catch(() => showToast("コピーに失敗しました"));
  }

  function openShareWindow(url: string) {
    setOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyText(text: string, successMsg: string) {
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(successMsg))
      .catch(() => showToast("コピーに失敗しました"));
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="共有 (c)"
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
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
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
          <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={(e) => {
                if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
              }}
            />
            <div
              ref={menuRef}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[140px]"
              style={{ top: pos.top, right: pos.right }}
            >
              {typeof navigator.share === "function" && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigator.share({ url: article.link!, title: article.title }).catch(() => {});
                  }}
                  className={MENU_ITEM_CLS}
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
                onClick={() =>
                  openShareWindow(
                    `https://x.com/intent/tweet?url=${encodeURIComponent(article.link!)}&text=${encodeURIComponent(article.title)}`,
                  )
                }
                className={MENU_ITEM_CLS}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.833L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                X でシェア
              </button>
              <button onClick={handleSlackShare} className={MENU_ITEM_CLS}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                </svg>
                Slack で共有
              </button>
              <button
                onClick={() =>
                  openShareWindow(
                    `https://bsky.app/intent/compose?text=${encodeURIComponent(`${article.title}\n${article.link!}`)}`,
                  )
                }
                className={MENU_ITEM_CLS}
              >
                <svg width="12" height="12" viewBox="0 0 568 501" fill="currentColor">
                  <path d="M123.121 33.664C188.24 82.553 258.88 181.68 284 234.873c25.12-53.192 95.76-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.748c0 17.46-10.033 146.8-15.914 167.727-20.432 73.21-94.853 91.82-161.048 80.508C507.337 328.795 527.755 396.26 461.455 462.86c-123.063 120.605-176.695-30.26-190.138-68.847-2.857-8.18-4.195-12.011-4.317-8.773-.122-3.238-1.46.594-4.317 8.773-13.443 38.587-67.075 189.452-190.138 68.847-66.3-66.6-45.882-134.065 71.521-156.877-66.195 11.312-140.616-7.298-161.048-80.508C-15.77 204.548-25.803 75.208-25.803 57.748-25.803-28.906 50.134-1.611 123.121 33.664z" />
                </svg>
                Bluesky でシェア
              </button>
              <button
                onClick={() =>
                  openShareWindow(
                    `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(article.link!)}`,
                  )
                }
                className={MENU_ITEM_CLS}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                LINE でシェア
              </button>
              <button
                onClick={() =>
                  openShareWindow(
                    `https://b.hatena.ne.jp/add?mode=confirm&url=${encodeURIComponent(article.link!)}&title=${encodeURIComponent(article.title)}`,
                  )
                }
                className={MENU_ITEM_CLS}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <rect x="1" y="1" width="22" height="22" rx="3" fill="currentColor" />
                  <text
                    x="12"
                    y="17"
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="bold"
                    fill="var(--color-surface-base)"
                    fontFamily="sans-serif"
                  >
                    B!
                  </text>
                </svg>
                はてなブックマーク
              </button>
              <button
                onClick={() =>
                  copyText(`${article.title}\n${article.link!}`, "タイトルと URL をコピーしました")
                }
                className={MENU_ITEM_CLS}
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
              <button
                onClick={() => {
                  const mdTitle = (article.title || article.link!).replace(/[[\]]/g, "\\$&");
                  copyText(`[${mdTitle}](${article.link!})`, "Markdown リンクをコピーしました (C)");
                }}
                className={MENU_ITEM_CLS}
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
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 15V9l2.5 3 2.5-3v6M16 15v-4.5M14 12.5h4" />
                </svg>
                Markdown リンクをコピー
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// --- ToggleIconButton コンポーネント ---

interface ToggleIconButtonProps {
  isActive: boolean;
  onClick: () => void;
  title: string;
  activeClass: string;
  inactiveClass: string;
  children: React.ReactNode;
}

function ToggleIconButton({
  isActive,
  onClick,
  title,
  activeClass,
  inactiveClass,
  children,
}: ToggleIconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px] ${isActive ? activeClass : inactiveClass}`}
    >
      {children}
    </button>
  );
}

// --- FetchFullContentArea コンポーネント ---

interface FetchFullContentAreaProps {
  articleId: string;
  articleLink: string;
  feedHash: string;
  fetching: boolean;
  fetchError: string;
  onFetch: (onFetched?: () => void) => Promise<void>;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
}

function FetchFullContentArea({
  articleId,
  articleLink,
  feedHash,
  fetching,
  fetchError,
  onFetch,
  onEngagement,
}: FetchFullContentAreaProps) {
  return (
    <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onFetch(() => onEngagement?.(articleId, feedHash, "fetch_full"))}
          disabled={fetching}
          className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
        >
          {fetching ? (
            <>
              <Spinner />
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
          href={articleLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onEngagement?.(articleId, feedHash, "open_original")}
          className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
        >
          <ExternalLinkIcon size={14} />
          元記事を開く
        </a>
      </div>
      {fetchError && <p className="text-[11px] text-rose-400">{fetchError}</p>}
    </div>
  );
}

// --- ArticleNavigation コンポーネント ---

interface ArticleNavigationProps {
  prevArticle?: Article | null;
  nextArticle?: Article | null;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
}

function ArticleNavigation({
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
}: ArticleNavigationProps) {
  if (!prevArticle && !nextArticle) return null;
  return (
    <div className="mt-12 pt-6 border-t border-border-subtle flex items-stretch gap-3">
      {prevArticle ? (
        <button
          onClick={onSelectPrev}
          className="flex-1 text-left px-4 py-3 rounded-lg border border-border-default hover:border-text-faint hover:bg-surface-subtle transition-all duration-200 group"
        >
          <span className="flex items-center gap-1 text-[10px] tracking-[0.08em] uppercase text-text-faint mb-1.5">
            <ChevronSmall direction="left" />
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
            <ChevronSmall direction="right" />
          </span>
          <span className="text-[12px] leading-snug text-text-muted group-hover:text-text-strong transition-colors duration-200 line-clamp-2">
            {nextArticle.title}
          </span>
        </button>
      ) : (
        <div className="flex-1" />
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

/** 除外キーワード候補を記事情報から生成する */
function buildExcludeOptions(article: Article): { label: string; value: string }[] {
  return [
    { label: "この記事", value: article.title },
    ...(article.author ? [{ label: `著者「${article.author}」`, value: article.author }] : []),
    ...(article.categories ?? []).map((cat) => ({ label: `カテゴリ「${cat}」`, value: cat })),
    ...(article.metadata ?? []).map((m) => ({
      label: `${metaLabel(m.key)}「${m.value}」`,
      value: m.value,
    })),
  ];
}

/** FilterMenu / GlobalFilterMenu 共通の状態管理フック */
function useFilterMenuState(article: Article, currentFilter: KeywordFilter | null | undefined) {
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();
  const [modalOpen, setModalOpen] = useState(false);
  const hasFilter = !!(
    currentFilter &&
    (currentFilter.include.length > 0 || currentFilter.exclude.length > 0)
  );
  const excludeOptions = useMemo(() => buildExcludeOptions(article), [article]);
  return { open, setOpen, toggle, pos, btnRef, modalOpen, setModalOpen, hasFilter, excludeOptions };
}

/** FilterMenu / GlobalFilterMenu 共通の除外オプション一覧 */
function ExcludeOptionsSection({
  label,
  options,
  onExclude,
}: {
  label: string;
  options: { label: string; value: string }[];
  onExclude: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="border-t border-border-subtle">
      <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
        {label}
      </p>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onExclude(opt.value)} className={MENU_ITEM_CLS}>
          {XIcon}
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function ImageGallery({ images }: { images: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxTouchRef = useRef<number | null>(null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, images.length]);

  function handleLightboxTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    lightboxTouchRef.current = e.touches[0].clientX;
  }

  function handleLightboxTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    if (lightboxTouchRef.current === null || lightboxIndex === null) return;
    const dx = e.changedTouches[0].clientX - lightboxTouchRef.current;
    lightboxTouchRef.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && lightboxIndex < images.length - 1) setLightboxIndex(lightboxIndex + 1);
    else if (dx > 0 && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
  }

  return (
    <>
      <section className="mt-8 pt-6 border-t border-border-subtle">
        <p className="text-[10px] tracking-[0.2em] uppercase text-text-muted mb-3">画像一覧</p>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className="flex-shrink-0 cursor-zoom-in"
            >
              <img
                src={src}
                alt=""
                className="h-24 w-auto max-w-[180px] object-cover rounded bg-surface-subtle"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxIndex(null)}
            aria-label="閉じる"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              aria-label="前の画像"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}
          {lightboxIndex < images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              aria-label="次の画像"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
          <img
            src={images[lightboxIndex]}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-[12px] tabular-nums">
            {lightboxIndex + 1} / {images.length}
          </p>
        </div>
      )}
    </>
  );
}

function FilterMenu({ article, feed, onSaveFilter, showToast }: FilterMenuProps) {
  const { open, setOpen, toggle, pos, btnRef, modalOpen, setModalOpen, hasFilter, excludeOptions } =
    useFilterMenuState(article, feed.filter);

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

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="フィルター設定"
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open || hasFilter ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
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
          <path d="M3 4h18M7 8h10M11 12h2M9 16h6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[49]" onPointerDown={() => setOpen(false)} />
            <div
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[200px] max-h-[320px] overflow-y-auto"
              style={{ top: pos.top, right: pos.right }}
            >
              <button
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className={MENU_ITEM_CLS}
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
              <ExcludeOptionsSection
                label="除外する"
                options={excludeOptions}
                onExclude={(v) => void handleExclude(v)}
              />
            </div>
          </>,
          document.body,
        )}
      {modalOpen && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setModalOpen(false)}
          onSave={(filter) => onSaveFilter(feed.id, filter)}
        />
      )}
    </>
  );
}

// --- GlobalFilterMenu コンポーネント ---

interface GlobalFilterMenuProps {
  article: Article;
  globalFilter: KeywordFilter | null;
  onSaveGlobalFilter: (filter: KeywordFilter | null) => void;
  showToast?: (msg: string) => void;
}

function GlobalFilterMenu({
  article,
  globalFilter,
  onSaveGlobalFilter,
  showToast,
}: GlobalFilterMenuProps) {
  const { open, setOpen, toggle, pos, btnRef, modalOpen, setModalOpen, hasFilter, excludeOptions } =
    useFilterMenuState(article, globalFilter);

  function handleExclude(value: string) {
    setOpen(false);
    const existingExclude = globalFilter?.exclude ?? [];
    if (existingExclude.includes(value)) {
      showToast?.("既にグローバル除外キーワードに登録されています");
      return;
    }
    const newFilter: KeywordFilter = {
      include: globalFilter?.include ?? [],
      exclude: [...existingExclude, value],
      matchCategories: globalFilter?.matchCategories,
    };
    onSaveGlobalFilter(newFilter);
    showToast?.(`「${value}」をグローバル除外キーワードに追加しました`);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="グローバルフィルター設定（全フィード共通）"
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open || hasFilter ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
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
          <path d="M3 4h18M7 8h10M11 12h2" />
          <circle cx="19" cy="19" r="3" />
          <path d="M19 17v2l1 1" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[49]" onPointerDown={() => setOpen(false)} />
            <div
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[220px] max-h-[320px] overflow-y-auto"
              style={{ top: pos.top, right: pos.right }}
            >
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                  グローバルフィルター
                </p>
                <p className="text-[10px] text-text-faint mt-0.5">全フィードに適用</p>
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className={MENU_ITEM_CLS}
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
                  <path d="M3 4h18M7 8h10M11 12h2" />
                </svg>
                フィルター設定を開く
              </button>
              <ExcludeOptionsSection
                label="全フィードから除外する"
                options={excludeOptions}
                onExclude={handleExclude}
              />
            </div>
          </>,
          document.body,
        )}
      {modalOpen && (
        <FeedFilterModal
          title="グローバルフィルター"
          initialFilter={globalFilter}
          onClose={() => setModalOpen(false)}
          onSave={(filter) => {
            onSaveGlobalFilter(filter);
          }}
        />
      )}
    </>
  );
}

// --- SnoozeMenu コンポーネント ---

const SNOOZE_OPTIONS = [
  { label: "1時間後", durationMs: 60 * 60 * 1000 },
  { label: "3時間後", durationMs: 3 * 60 * 60 * 1000 },
  { label: "明日（1日後）", durationMs: 24 * 60 * 60 * 1000 },
  { label: "来週（1週間後）", durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

interface SnoozeMenuProps {
  articleId: string;
  onSnooze: (id: string, durationMs: number) => void;
  onSelectNext?: () => void;
  showToast?: (msg: string) => void;
}

function SnoozeMenu({ articleId, onSnooze, onSelectNext, showToast }: SnoozeMenuProps) {
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();

  function handleSnooze(durationMs: number, label: string) {
    setOpen(false);
    onSnooze(articleId, durationMs);
    showToast?.(`${label}までスヌーズ`);
    onSelectNext?.();
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="スヌーズ（後で再表示）"
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
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
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[49]" onPointerDown={() => setOpen(false)} />
            <div
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px]"
              style={{ top: pos.top, right: pos.right }}
            >
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                  スヌーズ
                </p>
              </div>
              <div className="border-t border-border-subtle">
                {SNOOZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.durationMs}
                    onClick={() => handleSnooze(opt.durationMs, opt.label)}
                    className={MENU_ITEM_CLS}
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
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// --- SelectionExcludePopup コンポーネント ---

const MAX_SELECTION_LENGTH = 100;

interface SelectionPopupState {
  x: number;
  y: number;
  text: string;
}

/** 記事本文エリア内のテキスト選択を検知してポップアップ表示用の状態を返す */
function useSelectionExclude(containerRef: React.RefObject<HTMLElement | null>) {
  const [popup, setPopup] = useState<SelectionPopupState | null>(null);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function checkSelection() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setPopup(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length > MAX_SELECTION_LENGTH) {
        setPopup(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!containerRef.current?.contains(range.commonAncestorContainer)) {
        setPopup(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPopup({ x: rect.left + rect.width / 2, y: rect.top, text });
    }

    // PC: pointerup で即時評価（debounce をキャンセルして二重発火を防ぐ）
    function handlePointerUp() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      checkSelection();
    }

    // スマホ: 長押し選択ハンドル操作中は pointerup が発火しないため
    // selectionchange をデバウンスして選択確定後に評価する
    function handleSelectionChange() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkSelection, 150);
    }

    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [containerRef]);

  const clearPopup = useCallback(() => {
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return { popup, clearPopup };
}

interface SelectionExcludePopupProps {
  popup: SelectionPopupState;
  article: { title: string; link: string };
  globalFilter?: KeywordFilter | null;
  onSaveGlobalFilter?: (filter: KeywordFilter | null) => void;
  showToast?: (msg: string) => void;
  onClose: () => void;
}

function SelectionExcludePopup({
  popup,
  article,
  globalFilter,
  onSaveGlobalFilter,
  showToast,
  onClose,
}: SelectionExcludePopupProps) {
  const displayText = popup.text.length > 24 ? `${popup.text.slice(0, 24)}…` : popup.text;

  function doCopyQuote(e: { preventDefault: () => void }) {
    e.preventDefault();
    const quote = `> ${popup.text.replace(/\n/g, "\n> ")}\n\n— [${article.title}](${article.link})`;
    navigator.clipboard
      .writeText(quote)
      .then(() => showToast?.("引用をコピーしました"))
      .catch(() => showToast?.("コピーに失敗しました"));
    onClose();
  }

  function doExclude(e: { preventDefault: () => void }) {
    e.preventDefault(); // 選択を維持しつつボタン押下
    const existing = globalFilter?.exclude ?? [];
    if (existing.includes(popup.text)) {
      showToast?.("既にグローバル除外キーワードに登録されています");
    } else {
      onSaveGlobalFilter?.({
        include: globalFilter?.include ?? [],
        exclude: [...existing, popup.text],
        matchCategories: globalFilter?.matchCategories,
      });
      showToast?.(`「${displayText}」をグローバル除外に追加しました`);
    }
    onClose();
  }

  return (
    <div className="fixed z-50 pointer-events-none" style={{ left: popup.x, top: popup.y }}>
      <div className="pointer-events-auto -translate-x-1/2 -translate-y-full mb-2 transform">
        <div className="bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden">
          <button
            onMouseDown={doCopyQuote}
            onTouchEnd={doCopyQuote}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors whitespace-nowrap w-full"
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
              className="flex-shrink-0 text-text-muted"
            >
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
            </svg>
            <span>引用をコピー</span>
          </button>
          {onSaveGlobalFilter && (
            <>
              <div className="border-t border-border-subtle" />
              <button
                onMouseDown={doExclude}
                onTouchEnd={doExclude}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors whitespace-nowrap w-full"
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
                  className="flex-shrink-0 text-text-muted"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>「{displayText}」を除外</span>
              </button>
            </>
          )}
        </div>
        {/* 吹き出し三角 */}
        <div className="flex justify-center -mt-px">
          <div className="w-2 h-2 bg-surface-elevated border-r border-b border-border-default rotate-45 -translate-y-1" />
        </div>
      </div>
    </div>
  );
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
  fontFamily = "sans",
  onChangeFontFamily,
  showToast,
  prevArticle,
  nextArticle,
  onSelectPrev,
  onSelectNext,
  theme = "light",
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
}: Props) {
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

  // AI 評価ボタンの選択状態（記事切り替え時にリセット）
  const [summaryRating, setSummaryRating] = useState<"good" | "neutral" | "bad" | null>(null);
  const [translateRating, setTranslateRating] = useState<"good" | "neutral" | "bad" | null>(null);
  useEffect(() => {
    setSummaryRating(null);
    setTranslateRating(null);
  }, [article?.id]);

  // メモ編集ステート（記事切り替え時にリセット）
  const [noteText, setNoteText] = useState(note ?? "");
  const [noteExpanded, setNoteExpanded] = useState(!!note);
  useEffect(() => {
    setNoteText(note ?? "");
    setNoteExpanded(!!note);
    // note は deps から除外 — 記事切り替え時のみリセットし、保存後の prop 更新では上書きしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

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
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const articleIdRef = useSyncedRef(article?.id);

  // 記事切り替え時にスクロール位置をリセットまたは復元
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const saved = article?.id ? loadScrollPos(article.id) : 0;
    el.scrollTop = saved;
  }, [article?.id]);

  // 全文取得・AI 要約・スクロールショートカット (v / a / Space / Shift+Space)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "v" && article?.link && !storedContent && !fetching) {
        void fetchFullContent();
      }
      if (e.key === "a" && article?.link) {
        if (aiResult) {
          resetAi();
        } else if (!aiLoading && !fetching) {
          void doRunAi(article.link, article.id);
        }
      }
      if (e.key === "z" && article?.link) {
        if (translateResult) {
          resetTranslate();
        } else if (!translateLoading && !fetching) {
          void doTranslate(article.link, article.id);
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
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    article?.link,
    article?.id,
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
  ]);

  const handleNoteBlur = useCallback(() => {
    if (!article || !onSetNote) return;
    const trimmed = noteText.trim();
    const current = note ?? "";
    if (trimmed === current) return;
    if (trimmed === "") {
      onDeleteNote?.(article.id);
    } else {
      onSetNote(article.id, trimmed);
    }
  }, [article, note, noteText, onDeleteNote, onSetNote]);

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

  const embedInfo = article?.link ? extractEmbedInfo(article.link) : null;

  // 取得済みコンテンツ: フェッチ結果 > キャッシュ > RSS 本文
  const rawContent = storedContent ?? article?.content ?? null;
  const processedContent = rawContent
    ? embedInfo
      ? stripIframes(rawContent)
      : processContent(rawContent, theme)
    : null;

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

  // X (Twitter) ツイート iframe を postMessage で動的リサイズ
  // platform.twitter.com から {"method":"twttr.resize","params":{"height":N}} が届くたびに
  // 対応する iframe の高さを更新する
  useEffect(() => {
    if (!processedContent) return;
    function handleMessage(e: MessageEvent) {
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
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [processedContent]);

  // 記事が変わったらプログレスバーをリセット（AI 状態は useArticleAi が担当）
  useEffect(() => {
    if (progressBarRef.current) {
      const saved = article?.id ? loadScrollPos(article.id) : 0;
      const el = mainRef.current;
      const pct =
        saved > 0 && el && el.scrollHeight > el.clientHeight
          ? Math.round((saved / (el.scrollHeight - el.clientHeight)) * 100)
          : 0;
      progressBarRef.current.style.width = `${pct}%`;
      progressBarRef.current.style.display = pct > 0 ? "" : "none";
    }
  }, [article?.id]);

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
  }, [processedContent]);

  // 検索クエリのハイライト — query / processedContent が変わるたびに DOM に <mark> を注入し、
  // 次回実行前に前回の marks を text node に戻してクリーンアップする
  const highlightMarksRef = useRef<HTMLElement[]>([]);
  useEffect(() => {
    // 前回の marks をクリーンアップ
    for (const mark of highlightMarksRef.current) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    }
    highlightMarksRef.current = [];

    const q = query.trim();
    if (!contentRef.current || !q || !processedContent) return;

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const marks: HTMLElement[] = [];

    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_SKIP;
        if (parent.closest("pre, code, script, style")) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      if (!regex.test(text)) {
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const mark = document.createElement("mark");
        mark.className = "search-highlight";
        mark.textContent = match[0];
        fragment.appendChild(mark);
        marks.push(mark);
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    highlightMarksRef.current = marks;

    // 先頭のマッチ箇所へスクロール
    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [query, processedContent]);

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
    // スクロール位置を debounce して保存
    const scrollTop = el.scrollTop;
    const id = articleIdRef.current;
    if (id && scrollTop > 0) {
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = setTimeout(() => {
        saveScrollPos(id, scrollTop);
      }, 500);
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
        {/* メタ行 + アクション行（モバイルでは縦並び、PCでは横並び） */}
        <div className="mb-5 text-[11px] text-text-muted flex flex-col lg:flex-row lg:items-center gap-y-2">
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

          {/* アクションボタン群: モバイルでは右寄せ flex-wrap、PCでは右端固定 */}
          <div className="flex flex-wrap justify-end items-center gap-2 lg:gap-1.5 lg:flex-nowrap lg:ml-auto">
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

            {/* フォントファミリー切り替え */}
            {onChangeFontFamily && (
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
                    if (article.link) doTranslate(article.link, article.id);
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

            {article.link && showToast && <ShareMenu article={article} showToast={showToast} />}
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

            <ToggleIconButton
              isActive={isInReadingList}
              onClick={() => {
                onToggleReadingList(article.id);
                showToast?.(isInReadingList ? "後で読むから削除" : "後で読むに追加");
              }}
              title={isInReadingList ? "後で読むから削除" : "後で読む"}
              activeClass="text-text-default hover:text-text-muted"
              inactiveClass="text-text-faint hover:text-text-default"
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
            </ToggleIconButton>
            <ToggleIconButton
              isActive={isBookmarked}
              onClick={() => onToggleBookmark(article.id)}
              title={isBookmarked ? "ブックマーク解除 (b)" : "ブックマーク (b)"}
              activeClass="text-bookmark hover:text-text-muted"
              inactiveClass="text-text-faint hover:text-bookmark"
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
            </ToggleIconButton>
            <ToggleIconButton
              isActive={isLiked}
              onClick={() => onToggleLike(article.id)}
              title={isLiked ? "いいね解除" : "いいね"}
              activeClass="text-rose-400 hover:text-text-muted"
              inactiveClass="text-text-faint hover:text-rose-400"
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
            </ToggleIconButton>
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

        {/* AI 翻訳パネル */}
        {translateResult && (
          <div className="mb-8 px-4 py-3 rounded-lg border border-border-default bg-surface-base animate-fade-up">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint">AI 翻訳</p>
              <div className="flex items-center gap-1">
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
            </div>
            <p className="text-[14px] leading-[1.8] text-text-default whitespace-pre-wrap">
              {translateResult}
            </p>
          </div>
        )}
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

        {/* 本文 */}
        {processedContent ? (
          <div
            ref={contentRef}
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]}`}
            // dangerouslySetInnerHTML の中は React がテキストノードを管理しないため
            // Google 翻訳の <font> 注入と React 調停が衝突しない。
            // html 要素の translate="no" を上書きして翻訳を許可する。
            translate="yes"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : article.summary ? (
          <p
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]}`}
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
