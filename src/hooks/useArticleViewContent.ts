"use client";

import { useMemo } from "react";
import type { Article } from "../types";
import type { Theme } from "./useThemePreference";
import { readingTime } from "../lib/article-utils";
import { collectImageUrlsFromHtml } from "../lib/image-extractor";
import { extractEmbedInfo, processContent, stripIframes } from "../lib/embed-utils";

const SHORT_CONTENT_THRESHOLD = 400;

export interface ArticleViewContentResult {
  embedInfo: ReturnType<typeof extractEmbedInfo>;
  processedContent: string | null;
  galleryImages: string[];
  canFetch: boolean;
  /** サマリ含む「描画可能なコンテンツがあるか」（AI/TTS ボタン表示判定など UI 用） */
  hasContent: boolean;
  /** 全文 (`processedContent`) が存在するか — オートモードの speak gate に使う (#663) */
  hasFullContent: boolean;
  hasImages: boolean;
  readingMins: number;
}

export function useArticleViewContent(
  article: Article | null,
  storedContent: string | null,
  resolvedOgImage: string | null,
  theme: Theme,
): ArticleViewContentResult {
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

  const isShortContent = !article?.content || article.content.length < SHORT_CONTENT_THRESHOLD;
  const canFetch = !embedInfo && !!article?.link && isShortContent && !storedContent;
  const hasContent = !!(processedContent || article?.summary);
  const hasFullContent = !!processedContent;
  const hasImages =
    !!(article?.ogImage ?? resolvedOgImage) ||
    !!(processedContent && /<img\b/i.test(processedContent));
  const readingMins = readingTime(processedContent ?? article?.summary ?? "");

  return {
    embedInfo,
    processedContent,
    galleryImages,
    canFetch,
    hasContent,
    hasFullContent,
    hasImages,
    readingMins,
  };
}
