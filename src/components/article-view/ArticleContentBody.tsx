"use client";

import React, { useRef } from "react";
import type { Article, EngagementAction } from "../../types";
import type { EmbedInfo } from "../../lib/embed-utils";
import type { AiOperationResult } from "../../hooks/useArticleAi";
import type { AiRating, ContentTab } from "../../hooks/useArticleAiRatings";
import { useReaderSettings } from "../../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { useSliderGallery } from "../../hooks/useSliderGallery";
import { useContentLinkPreviews } from "../../hooks/useContentLinkPreviews";
import { useSyntaxHighlight } from "../../hooks/useSyntaxHighlight";
import { useMathRender } from "../../hooks/useMathRender";
import { useArticleHighlight } from "../../hooks/useArticleHighlight";
import { useEventListener } from "../../hooks/useEventListener";
import { sanitizeHtml } from "../../lib/html";
import { buildImageProxyUrl } from "../../lib/image-proxy-url";
import { FONT_SIZE_CLASSES, FONT_FAMILY_CLASSES } from "../../lib/article-utils";
import { getLineHeightStyle } from "../../lib/reader-settings";
import ImageGallery from "./ImageGallery";
import FetchFullContentArea from "./FetchFullContentArea";

interface ArticleContentBodyProps {
  article: Article;
  embedInfo: EmbedInfo | null;
  processedContent: string | null;
  resolvedOgImage: string | null;
  translateResult: AiOperationResult | null;
  translateError: string;
  contentTab: ContentTab;
  setContentTab: (tab: ContentTab) => void;
  translateRating: AiRating;
  setTranslateRating: (rating: AiRating) => void;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
  canFetch: boolean;
  fetching: boolean;
  fetchError: string;
  fetchFullContent: (onFetched?: (content: string) => void) => Promise<void>;
  galleryImages: string[];
}

const ArticleContentBody = React.forwardRef<HTMLDivElement, ArticleContentBodyProps>(
  function ArticleContentBody(props, ref) {
    const {
      article,
      embedInfo,
      processedContent,
      resolvedOgImage,
      translateResult,
      translateError,
      contentTab,
      setContentTab,
      translateRating,
      setTranslateRating,
      onEngagement,
      canFetch,
      fetching,
      fetchError,
      fetchFullContent,
      galleryImages,
    } = props;

    const contentRef = useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => contentRef.current!);

    const { fontSize, fontFamily, lineHeight, textJustify } = useReaderSettings();
    const { query } = useArticleFilter();

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

    // 本文内スタンドアロンリンクに OGP プレビューカードを注入
    useContentLinkPreviews(contentRef, processedContent);

    // シンタックスハイライト（highlight.js）と数式レンダリング（KaTeX）
    useSyntaxHighlight(contentRef, processedContent);
    useMathRender(contentRef, processedContent);

    // 検索クエリのハイライト — query / processedContent が変わるたびに DOM に <mark> を注入
    useArticleHighlight({ contentRef, query, processedContent });

    return (
      <>
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

        {/* 翻訳エラー */}
        {translateError && <p className="mb-6 text-[11px] text-rose-400">{translateError}</p>}

        {/* OGP 画像 (埋め込みなし) */}
        {!embedInfo && (article.ogImage ?? resolvedOgImage) && (
          <img
            src={buildImageProxyUrl((article.ogImage ?? resolvedOgImage)!)}
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
            {contentTab === "translate" && translateResult?.provider && (
              <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-subtle">
                {translateResult.provider === "browser" ? "Chrome 翻訳" : "Workers AI"}
              </span>
            )}
            {contentTab === "translate" && (
              <div className="ml-auto flex items-center gap-1 pb-1">
                {(["good", "neutral", "bad"] as const).map((rating) => (
                  <button
                    key={rating}
                    title={rating === "good" ? "良い" : rating === "neutral" ? "普通" : "悪い"}
                    aria-label={`翻訳の評価: ${rating === "good" ? "良い" : rating === "neutral" ? "普通" : "悪い"}`}
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
              style={getLineHeightStyle(lineHeight)}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(translateResult.text) }}
            />
          ) : (
            <p
              className={`article-content whitespace-pre-wrap ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
              style={getLineHeightStyle(lineHeight)}
            >
              {translateResult.text}
            </p>
          )
        ) : processedContent ? (
          <div
            ref={contentRef}
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
            style={getLineHeightStyle(lineHeight)}
            translate="yes"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : article.summary ? (
          <p
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
            style={getLineHeightStyle(lineHeight)}
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
      </>
    );
  },
);

export default ArticleContentBody;
