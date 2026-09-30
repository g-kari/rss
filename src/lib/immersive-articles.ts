import type { Article } from "../types";
import { isArticleRead } from "./article-filter";
import {
  rankArticleRecommendations,
  type ArticleRecommendationOptions,
} from "./article-recommendations";
import { toPlainText } from "./html";
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
