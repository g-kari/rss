"use client";

import { useRef, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import type { Article, EngagementAction } from "../../types";
import { AI_RATINGS } from "../../types";
import type { EmbedInfo } from "../../lib/embed-utils";
import type { AiOperationResult, AiError } from "../../hooks/useArticleAi";
import type { AiRatingState, ContentTab } from "../../hooks/useArticleAiRatings";
import { useReaderSettings } from "../../contexts/ReaderSettingsContext";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { useSliderGallery } from "../../hooks/useSliderGallery";
import { useContentLinkPreviews } from "../../hooks/useContentLinkPreviews";
import { useSyntaxHighlight } from "../../hooks/useSyntaxHighlight";
import { useMathRender } from "../../hooks/useMathRender";
import { useArticleHighlight } from "../../hooks/useArticleHighlight";
import { useArticleImageMaxWidth } from "../../hooks/useArticleImageMaxWidth";
import { useEventListener } from "../../hooks/useEventListener";
import { sanitizeHtml } from "../../lib/html";
import { shouldScrollSentence, findScrollableAncestor } from "../../lib/tts-scroll";
import { buildImageProxyUrl } from "../../lib/image-proxy-url";
import { FONT_SIZE_CLASSES, FONT_FAMILY_CLASSES } from "../../lib/article-utils";
import { getLineHeightStyle } from "../../lib/reader-settings";
import ImageGallery from "./ImageGallery";
import FetchFullContentArea from "./FetchFullContentArea";

interface ArticleContentBodyProps {
  article: Article;
  embedInfo: EmbedInfo | null;
  processedContent: string | null;
  /** sentence span ラップ済み HTML (#672 Phase 2) — TTS ハイライト時に使用 */
  wrappedContent?: string | null;
  /** 現在 active なセンテンス index (#672 Phase 2)。-1 = 非アクティブ */
  activeSentenceIndex?: number;
  resolvedOgImage: string | null;
  translateResult: AiOperationResult | null;
  translateError: AiError | null;
  contentTab: ContentTab;
  setContentTab: (tab: ContentTab) => void;
  translateRating: AiRatingState;
  setTranslateRating: (rating: AiRatingState) => void;
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
  onRetryTranslate?: () => void;
}

const ArticleContentBody = forwardRef<HTMLDivElement, ArticleContentBodyProps>(
  function ArticleContentBody(props, ref) {
    const {
      article,
      embedInfo,
      processedContent,
      wrappedContent,
      activeSentenceIndex = -1,
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
      onRetryTranslate,
    } = props;

    const contentRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => contentRef.current!);

    const { fontSize, fontFamily, lineHeight, textJustify } = useReaderSettings();
    const { query } = useArticleFilter();

    // #672 Phase 2: activeSentenceIndex に応じて DOM の sentence span に
    // .tts-active-sentence クラスを付け、最初の active span に scrollIntoView
    // #659: 「画面下部基準で見づらい」「画像で押し下げられる」というユーザー要望に応えて
    //        block: "nearest" → 快適ゾーン (中央 30〜70%) 外なら block: "center" に切替
    useEffect(() => {
      const root = contentRef.current;
      if (!root) return;
      // 旧 active を全削除
      const previous = root.querySelectorAll<HTMLElement>(".tts-active-sentence");
      previous.forEach((el) => el.classList.remove("tts-active-sentence"));
      if (activeSentenceIndex < 0) return;
      // 新 active を追加 (同センテンスが複数 span に分割されている可能性あり)
      const next = root.querySelectorAll<HTMLElement>(
        `[data-tts-sentence-idx="${activeSentenceIndex}"]`,
      );
      if (next.length === 0) return;
      next.forEach((el) => el.classList.add("tts-active-sentence"));
      // 最初の active span を快適ゾーンに収める (画像直後等で下部に来た場合のみセンタリング)
      const target = next[0];
      const scrollEl = findScrollableAncestor(target);
      if (!scrollEl) return;
      const elRect = target.getBoundingClientRect();
      const cRect = scrollEl.getBoundingClientRect();
      const decision = shouldScrollSentence({
        elementTop: elRect.top,
        elementBottom: elRect.bottom,
        containerTop: cRect.top,
        containerBottom: cRect.bottom,
      });
      if (decision.shouldScroll) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, [activeSentenceIndex]);

    // PC 用: 画像スライダーに prev/next ボタンと wheel リダイレクトを注入する
    useSliderGallery(contentRef, processedContent);

    // #680: HTML 属性 width/height がない画像の引き伸ばしを防止
    useArticleImageMaxWidth(contentRef, processedContent);

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

    // #709: RSS の `<content:encoded>` / `<description>` に SpeakerDeck / SlideShare
    // iframe 等のリッチ HTML が含まれる場合、`/api/content` で全文取得しなくても
    // article.content を直接描画してスライドを表示する。
    // xml-parser → applyCorePipeline で iframe 変換 + sanitize 済みだが、cache 経路や
    // 過去データ混入の安全網として再 sanitize する (sanitizeHtml は冪等)。
    const sanitizedArticleContent = useMemo(
      () => (article.content ? sanitizeHtml(article.content) : null),
      [article.content],
    );
    // sanitize 後に意味のあるリッチ HTML (タグを含む) が残っているか確認。
    // 単なる plain text なら summary との重複なので fallback 不要。
    const hasArticleContentHtml = !!(
      sanitizedArticleContent && /<[a-z][\s\S]*?>/i.test(sanitizedArticleContent)
    );

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
        {translateError && (
          <div className="mb-6 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-error mt-[1px] shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-error">{translateError.message}</p>
                {translateError.type === "rate_limit" && (
                  <p className="text-[11px] text-text-muted mt-0.5">
                    少し時間をおいてから再試行してください。
                  </p>
                )}
              </div>
            </div>
            {onRetryTranslate && (
              <button
                onClick={onRetryTranslate}
                className="self-start flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200"
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
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 .49-3" />
                </svg>
                再試行
              </button>
            )}
          </div>
        )}

        {/* OGP 画像 (埋め込みなし)。#742: 一覧 (`resolveThumbnail`) と detail でサムネ解決が
            分裂する問題のため、useOgpCache 由来の resolvedOgImage を article.ogImage より優先。
            #741: 小サムネ (< 200px) は naturalWidth で検知して hide する。 */}
        {!embedInfo && (resolvedOgImage ?? article.ogImage) && (
          <OgImageThumbnail src={buildImageProxyUrl((resolvedOgImage ?? article.ogImage)!)} />
        )}

        {/* 原文 / 翻訳タブ（翻訳結果がある場合のみ表示） */}
        {translateResult && processedContent && (
          <div
            className="mb-4 flex items-center gap-1 border-b border-border-default"
            role="tablist"
          >
            <button
              role="tab"
              aria-selected={contentTab === "original"}
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
              role="tab"
              aria-selected={contentTab === "translate"}
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
                {AI_RATINGS.map((rating) => (
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
            dangerouslySetInnerHTML={{ __html: wrappedContent ?? processedContent }}
          />
        ) : hasArticleContentHtml ? (
          <div
            ref={contentRef}
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} ${textJustify ? "text-justify" : ""}`}
            style={getLineHeightStyle(lineHeight)}
            translate="yes"
            dangerouslySetInnerHTML={{ __html: sanitizedArticleContent! }}
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

/** OGP 画像。naturalWidth < 200px は小サムネと判定して自然サイズで中央配置に切替 (#741, #764)。
 *  #764: 一覧 (`resolveThumbnail`) はサイズチェックなしで表示するため list/detail で divergence が
 *  発生していた。hide すると「サムネ全く表示されない」UX 劣化になるので、w-full / aspect-video を外して
 *  自然サイズ中央配置にすることで「w-full の中で小さく見える」#741 問題も同時に解消する。 */
const OG_THUMBNAIL_MIN_WIDTH = 200;
function OgImageThumbnail({ src }: { src: string }) {
  const [isSmall, setIsSmall] = useState(false);
  return (
    <img
      src={src}
      alt=""
      className={
        isSmall
          ? "max-w-[200px] mx-auto rounded-lg mb-6"
          : "w-full rounded-lg object-contain bg-surface-subtle mb-6 aspect-video"
      }
      loading="lazy"
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth < OG_THUMBNAIL_MIN_WIDTH) setIsSmall(true);
      }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export default ArticleContentBody;
