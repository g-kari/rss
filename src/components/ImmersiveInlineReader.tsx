"use client";
import { useEffect, useMemo, useRef } from "react";
import type { Article } from "../types";
import { useArticleContent } from "../hooks/useArticleContent";
import { useArticleViewContent } from "../hooks/useArticleViewContent";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { processContent } from "../lib/embed-utils";
import { isValidPublicUrl } from "../lib/url";
import { prepareImmersiveInlineContent } from "../lib/immersive-inline-content";

/** Uses the existing content API/cache and sanitizing pipeline, without reader read/AI effects. */
export default function ImmersiveInlineReader({
  article,
  onClose,
}: {
  article: Article | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const attempted = useRef<string | undefined>(undefined);
  const {
    storedContent,
    fetching,
    fetchError,
    fetchRetryable,
    fetchFullContent,
    fetchFullContentOnce,
    resolvedOgImage,
  } = useArticleContent(article?.id, article?.link, article?.ogImage);
  const theme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";
  const { processedContent, embedInfo } = useArticleViewContent(
    article,
    storedContent,
    resolvedOgImage,
    theme,
  );
  // Feed content length is not evidence that it is the complete source article.
  // Only this explicit reader action requests the source, once, reusing an existing cache.
  const canFetch =
    !storedContent &&
    isValidPublicUrl(article?.link || "") &&
    (!embedInfo || embedInfo.type === "slides");
  const content = useMemo(
    () =>
      prepareImmersiveInlineContent(
        processedContent || processContent(article?.summary || "", theme),
      ),
    [processedContent, article?.summary, theme],
  );
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose,
    isOpen: !!article,
    initialFocusRef: titleRef,
  });
  useEffect(() => {
    if (!article) {
      attempted.current = undefined;
      return;
    }
    const key = `${article.id}:${article.link}`;
    if (attempted.current === key || fetching) return;
    attempted.current = key;
    if (canFetch) void fetchFullContentOnce();
  }, [article, fetching, canFetch, fetchFullContentOnce]);
  if (!article) return null;
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="ここで記事の本文を読む"
      className="immersive-inline-reader absolute inset-0 z-10 flex flex-col bg-surface-base text-text-strong"
      onKeyDown={(event) => {
        event.stopPropagation();
        handleKeyDown(event);
      }}
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border-default p-4">
        <p className="text-[13px]">本文を開いている間は自動再生・読み上げを一時停止します</p>
        <button
          type="button"
          className="min-h-11 flex-shrink-0 rounded border border-border-default px-3"
          onClick={onClose}
        >
          ショート表示に戻る
        </button>
      </header>
      <div role="document" className="min-h-0 flex-1 overflow-y-auto p-5">
        <h3 ref={titleRef} tabIndex={-1} className="mb-6 text-xl font-medium">
          {article.title}
        </h3>
        {fetching && <p role="status">全文を取得中…</p>}
        {fetchError && <p role="alert">全文を取得できませんでした: {fetchError}</p>}
        <p className="mb-4 text-[13px] text-text-muted">
          {storedContent
            ? "取得済みの記事本文"
            : "フィードに含まれる本文・説明を表示しています。全文とは限りません。"}
        </p>
        <div className="article-content" dangerouslySetInnerHTML={{ __html: content }} />
        {canFetch && !fetching && (
          <button
            type="button"
            className="mt-5 min-h-11 rounded border border-border-default px-3"
            disabled={!!fetchError && !fetchRetryable}
            onClick={() => void fetchFullContent()}
          >
            {fetchError ? "全文取得を再試行" : "全文を取得"}
          </button>
        )}
        {isValidPublicUrl(article.link) && (
          <a
            className="ml-3 underline"
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            元記事を開く
          </a>
        )}
      </div>
    </div>
  );
}
