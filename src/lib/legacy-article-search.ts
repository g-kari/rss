/** Compatibility search while the derived D1 index is explicitly disabled. */
import type { Article, ReadState, UserSubscription } from "../types";
import { compareByDateDesc } from "./article-utils";
import { pMap } from "./concurrency";
import { compileSearchQuery, type SearchContext } from "./full-text-search";
import { loadReadySearchIndex } from "./article-search-r2";
import {
  MAX_USER_ARTICLES,
  readFeedArticleObject,
  readFeedArticleRevision,
  readFeedArticleSnapshot,
  readFeedMeta,
} from "./shared-feed";

const BODY_CONCURRENCY = 4;

interface LegacyArticleSearchOptions {
  bucket: R2Bucket;
  query: string;
  subscriptions: UserSubscription[];
  savedArticles: Article[];
  readState: ReadState;
  limit?: number;
}

/** A worst-first heap bounds retained article bodies without changing date/id ordering. */
function offerArticle(heap: Article[], article: Article, limit: number): void {
  if (heap.length < limit) {
    heap.push(article);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareByDateDesc(heap[parent], heap[index]) >= 0) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
    return;
  }
  if (compareByDateDesc(article, heap[0]) >= 0) return;
  heap[0] = article;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let worst = index * 2 + 1;
    if (worst + 1 < heap.length && compareByDateDesc(heap[worst + 1], heap[worst]) > 0) worst++;
    if (compareByDateDesc(heap[index], heap[worst]) >= 0) break;
    [heap[index], heap[worst]] = [heap[worst], heap[index]];
    index = worst;
  }
}

/**
 * Preserve the original q-path semantics: saved copies win before matching, then subscription
 * order, then latest/archive order. Keyword and TTL filters do not apply to full-text search.
 * A ready per-feed R2 index replaces the page scan. Otherwise physical reads support both
 * legacy arrays and v2 segments. At most four bodies are in flight;
 * only top-K matching bodies and exact seen IDs are retained across physical-object batches.
 */
export async function searchLegacyArticles(
  options: LegacyArticleSearchOptions,
): Promise<Article[]> {
  const { bucket, query, subscriptions, savedArticles, readState } = options;
  const matcher = compileSearchQuery(query);
  const limit = Number.isFinite(options.limit ?? MAX_USER_ARTICLES)
    ? Math.min(Math.max(0, Math.floor(options.limit ?? MAX_USER_ARTICLES)), MAX_USER_ARTICLES)
    : MAX_USER_ARTICLES;
  if (!matcher || limit === 0) return [];
  const sources = await pMap(
    subscriptions,
    async (sub) => {
      const meta = await readFeedMeta(bucket, sub.feedHash);
      // Search does not use the ingestion dedup window; retaining it for every subscription
      // would otherwise accumulate up to 10,000 IDs per feed before the first article scan.
      return { sub, meta: meta ? { ...meta, knownIds: [] } : null };
    },
    BODY_CONCURRENCY,
  );
  const context: SearchContext = {
    feedTitleByHash: new Map(
      sources.map(({ sub, meta }) => [sub.feedHash, sub.customTitle || meta?.title || ""]),
    ),
    tagsByArticleId: readState.tagIds ?? undefined,
  };
  const seen = new Set<string>();
  const matched: Article[] = [];
  function accept(articles: Article[]): void {
    for (const article of articles) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      if (matcher?.(article, context)) offerArticle(matched, article, limit);
    }
  }
  accept(savedArticles);
  // Process feeds in subscription order; parallel completion must not decide duplicate winners.
  for (const { sub, meta } of sources) {
    const revision = await readFeedArticleRevision(bucket, sub.feedHash, meta);
    const indexed = await loadReadySearchIndex(bucket, sub.feedHash, revision);
    if (indexed) {
      accept(indexed);
      continue;
    }
    const snapshot = await readFeedArticleSnapshot(bucket, sub.feedHash, meta);
    accept(snapshot.latest);
    snapshot.latest = []; // Only the heap needs to retain matching latest article bodies.
    const segments = [...snapshot.segments].sort((a, b) => a.priority - b.priority);
    for (let offset = 0; offset < segments.length; offset += BODY_CONCURRENCY) {
      const objects = await pMap(
        segments.slice(offset, offset + BODY_CONCURRENCY),
        async (segment) => {
          const object = await readFeedArticleObject(bucket, sub.feedHash, segment.objectKey);
          if (!object) throw new Error(`Missing article object: ${segment.objectKey}`);
          return object.articles;
        },
        BODY_CONCURRENCY,
      );
      for (const articles of objects) accept(articles);
    }
  }
  return matched.sort(compareByDateDesc);
}
