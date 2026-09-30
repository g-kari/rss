import type { Article } from "../types";
import { isArticleRead } from "./article-filter";
import {
  rankArticleRecommendations,
  type ArticleRecommendationOptions,
} from "./article-recommendations";
import { toPlainText, unescapeHtml } from "./html";
import { isProxiedImageUrl } from "./image-proxy-url";
import { isValidPublicUrl } from "./url";

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

/** Explicit batches only: serving a card is neither a read nor an engagement signal. */
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
  const text = toPlainText(article.summary) || toPlainText(article.content || "");
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

/** Shared by compact recommendations and the immersive card; never request unsafe cache values. */
export function safeRecommendationThumbnail(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (isProxiedImageUrl(value)) {
    const original = new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("url");
    return original && isValidPublicUrl(original) ? value : undefined;
  }
  return isValidPublicUrl(value) ? value : undefined;
}

/** Short, verbatim caption cards; never cut a surrogate pair or invent a summary. */
export function immersiveCaptions(article: Article): string[] {
  const captions: string[] = [];
  for (const text of [article.title, immersiveExcerpt(article)].filter(Boolean)) {
    const sentences = text.match(/[^。！？.!?]+[。！？.!?]?/gu) ?? [text];
    let current = "";
    let parts = 0;
    for (const sentence of sentences) {
      const chars = Array.from(sentence);
      for (let offset = 0; offset < chars.length; offset += 44) {
        const chunk = chars.slice(offset, offset + 44).join("");
        if (parts >= 2 || Array.from(current + chunk).length > 44) {
          captions.push(current.trim());
          current = "";
          parts = 0;
        }
        current += chunk;
        parts += 1;
      }
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
