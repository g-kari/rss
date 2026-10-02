import type { Article } from "../types";
import { isArticleRead } from "./article-filter";
import {
  rankArticleRecommendations,
  type ArticleRecommendationOptions,
} from "./article-recommendations";
import { toPlainText, unescapeHtml } from "./html";
import { isProxiedImageUrl } from "./image-proxy-url";
import { collectImageUrlsFromHtml } from "./image-extractor";
import { contentLruCache } from "./lru-cache";
import { getProviderContentCacheId } from "./slide-providers";
import { resolveThumbnailSources } from "./article-utils";
import { isClipImageUrl } from "./clip-image-url";
import { isValidPublicUrl } from "./url";
import { immersiveSentences, sentenceExcerpt } from "./immersive-text";

export const IMMERSIVE_BATCH_SIZE = 10;

/** Recheck the strict source scope even when the list retains its selected read article. */
export function getImmersiveCandidates(options: ArticleRecommendationOptions): Article[] {
  const sourceIds = new Set(options.articles.map((article) => article.id));
  const feeds = new Map(options.feeds.map((feed) => [feed.id, feed]));
  const cutoff = options.readBeforeTimestamp ? Date.parse(options.readBeforeTimestamp) : null;
  return options.candidates.filter((article) => {
    const feed = feeds.get(article.feedHash);
    return (
      sourceIds.has(article.id) &&
      feed &&
      !(feed.mutedUntil && Date.parse(feed.mutedUntil) > options.now) &&
      !options.dismissedIds.has(article.id) &&
      !isArticleRead(article, options.readIds, cutoff)
    );
  });
}

/** Small local queue replenishments; queued cards are not read or engagement signals. */
export function createImmersiveBatch(options: ArticleRecommendationOptions, served: Article[]) {
  const seenIds = new Set(served.map((article) => article.id));
  const seenLinks = new Set(served.map((article) => article.link).filter(Boolean));
  return rankArticleRecommendations({
    ...options,
    candidates: getImmersiveCandidates(options).filter(
      (article) => !seenIds.has(article.id) && (!article.link || !seenLinks.has(article.link)),
    ),
    limit: IMMERSIVE_BATCH_SIZE,
  });
}

/** Reuse feed text without triggering extraction, translation, AI or media playback. */
export function immersiveExcerpt(article: Article): string {
  const cached = toPlainText(
    contentLruCache.get(getProviderContentCacheId(article.id, article.link)) || "",
  );
  const body = toPlainText(article.content || "");
  const summary = toPlainText(article.summary);
  return sentenceExcerpt(cached || (body.length >= summary.length ? body : summary));
}

/** Shared by compact recommendations and the immersive card; never request unsafe cache values. */
export function safeRecommendationThumbnail(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (isClipImageUrl(value)) return value;
  if (isProxiedImageUrl(value)) {
    const original = new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("url");
    return original && isValidPublicUrl(original) ? value : undefined;
  }
  return isValidPublicUrl(value) ? value : undefined;
}

/** Verbatim caption cards: up to two sentences, never arbitrary 44-character slices. */
export function immersiveCaptions(article: Article, excerpt = immersiveExcerpt(article)): string[] {
  const captions: string[] = [];
  for (const text of [article.title, excerpt].filter(Boolean)) {
    const sentences = immersiveSentences(text);
    let current = "";
    let parts = 0;
    for (const sentence of sentences) {
      if (current && (parts >= 2 || Array.from(current + sentence).length > 180)) {
        captions.push(current.trim());
        current = "";
        parts = 0;
      }
      current += sentence;
      parts += 1;
    }
    if (current.trim()) captions.push(current.trim());
  }
  return captions.length ? captions : ["気になったら「本文を読む」へ"];
}

/** Only reuse loaded native-video sources through the existing validated video proxy. */
export function immersiveVideoSource(article: Article): string | undefined {
  const html = article.content || article.summary;
  const video = /<video\b([^>]*)>([\s\S]*?)(?:<\/video\s*>|$)/i.exec(html);
  const source = video && /<source\b([^>]*)>/i.exec(video[2]);
  const attributes = [video?.[1], source?.[1]];
  for (const attrs of attributes) {
    const match = attrs && /(?:^|\s)src\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(attrs);
    if (!match) continue;
    const value = unescapeHtml(match[1] ?? match[2]);
    const original = value.startsWith("/api/video-proxy?")
      ? new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("url")
      : value;
    if (original && isValidPublicUrl(original))
      return `/api/video-proxy?url=${encodeURIComponent(original)}`;
  }
  if (isValidPublicUrl(article.link) && /\.(?:mp4|webm|mov)$/i.test(new URL(article.link).pathname))
    return `/api/video-proxy?url=${encodeURIComponent(article.link)}`;
  return undefined;
}

/** Loaded metadata and body images only. A bad OGP must not hide a good feed/body image. */
export function immersiveThumbnailSources(
  article: Article,
  ogpCache: Record<string, string>,
): string[] {
  const cachedBody = contentLruCache.get(getProviderContentCacheId(article.id, article.link));
  const candidates = [
    ...resolveThumbnailSources(article, ogpCache),
    ...collectImageUrlsFromHtml(cachedBody || "", { preferResponsive: true }),
    ...collectImageUrlsFromHtml(article.content || "", { preferResponsive: true }),
    ...collectImageUrlsFromHtml(article.summary, { preferResponsive: true }),
  ];
  const safe = Array.from(
    new Set(
      candidates
        .map((source) =>
          safeRecommendationThumbnail(typeof source === "string" ? unescapeHtml(source) : source),
        )
        .filter((source): source is string => !!source),
    ),
  );
  // Known small WordPress variants are list thumbnails, not fullscreen originals.
  // Reorder only supplied candidates; never guess an original URL or extract each slide.
  return [
    ...safe.filter((source) => !isSmallImmersiveImage(source)),
    ...safe.filter(isSmallImmersiveImage),
  ].slice(0, 8);
}

function isSmallImmersiveImage(source: string): boolean {
  const original = isProxiedImageUrl(source)
    ? new URLSearchParams(source.slice(source.indexOf("?") + 1)).get("url") || ""
    : source;
  const size = /-(\d+)x(\d+)\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i.exec(original);
  return !!size && Number(size[1]) < 800 && Number(size[2]) < 800;
}
