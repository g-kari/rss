"use client";

import { useMemo } from "react";
import type { Article } from "../types";
import type { Theme } from "./useThemePreference";
import { readingTime } from "../lib/article-utils";
import { collectImageUrlsFromHtml } from "../lib/image-extractor";
import { extractEmbedInfo, processContent, stripIframes } from "../lib/embed-utils";
import { wrapSentencesInHtml } from "../lib/tts-dom";
import type { Sentence } from "../lib/tts-sentences";

const SHORT_CONTENT_THRESHOLD = 400;

export interface ArticleViewContentResult {
  embedInfo: ReturnType<typeof extractEmbedInfo>;
  processedContent: string | null;
  /** sentence span でラップされた HTML — TTS ハイライトに使用 (#672 Phase 2) */
  wrappedContent: string | null;
  /** wrappedContent 内の data-tts-sentence-idx 順の sentence 配列 */
  ttsSentences: Sentence[];
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

  // #672 Phase 2: TTS ハイライト用にセンテンス span でラップした HTML と sentence 配列
  const { html: wrappedContent, sentences: ttsSentences } = useMemo(
    () =>
      processedContent
        ? wrapSentencesInHtml(processedContent)
        : { html: null as string | null, sentences: [] },
    [processedContent],
  );

  const isShortContent = !article?.content || article.content.length < SHORT_CONTENT_THRESHOLD;
  const canFetch = !embedInfo && !!article?.link && isShortContent && !storedContent;
  const hasContent = !!(processedContent || article?.summary);
  // #653: hasFullContent は「fetch 完了済み or fetch 不要」を厳格判定する。
  // 旧実装 `!!processedContent` は article.content (RSS 本文) があれば fetch 前でも
  // true になり、新記事遷移時に「fetch 前の短い本文で speak → ttsStop で即停止」を起こしていた。
  // 新実装: storedContent (fetch 済) があるか、または canFetch=false (fetch 不要) なら true。
  const hasFullContent = !!storedContent || !canFetch;
  const hasImages =
    !!(article?.ogImage ?? resolvedOgImage) ||
    !!(processedContent && /<img\b/i.test(processedContent));
  // readingTime() は内部で stripHtml (8 regex passes) を呼ぶため、
  // useMemo で processedContent / article.summary 変化時のみ再計算する。
  // これがないと TTS state 変化や reader settings 開閉などの親 re-render で毎回
  // 8 regex pass が走り、長記事 (10-50KB HTML) で主スレッドブロックが発生する。
  const readingMins = useMemo(
    () => readingTime(processedContent ?? article?.summary ?? ""),
    [processedContent, article?.summary],
  );

  return {
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
  };
}
