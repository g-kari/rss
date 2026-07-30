import type { Article, EngagementEntry, EngagementLog } from "../types";
import { aggregateGlobalTopFeeds, type GlobalFeedScore } from "./engagement-aggregator";
import { engagementKey, r2Get } from "./r2";
import { readLatestArticles, buildFeedUserMapCached } from "./shared-feed";
import { buildCacheKey, matchCfCache, buildJsonCacheResponse } from "./cache-helper";
import { fetchArticleContent } from "./fetch-article-content";
import { fetchPageOgpMeta } from "./ogp";
import { isValidPublicUrl, isValidFeedUrl } from "./url";
import { unescapeHtml } from "./html";
import { computeOgpCacheTtl } from "./ogp-cache-ttl";
import { pMapSettled } from "./concurrency";
import { formatError } from "./serialize-error";

/**
 * cron prefetch 設定値。
 *
 * #803 Phase 2 — AI 推奨値:
 * - topN=50 (top-50 feed まで)
 * - maxArticlesPerFeed=3 (Cloudflare Workers subrequest 1000 件上限を考慮、
 *   50 feeds × 3 articles × 2 (content+OGP) = 300 subrequests / cron 実行)
 * - minScore=1.0 (全ユーザーで like 級の閾値)
 */
export interface PrefetchOptions {
  topN: number;
  maxArticlesPerFeed: number;
  minScore: number;
  now?: number;
}

export const DEFAULT_PREFETCH_OPTIONS: Readonly<PrefetchOptions> = {
  topN: 50,
  maxArticlesPerFeed: 3,
  minScore: 1.0,
};

/**
 * cron prefetch の対象 article link URL リストを構築する純粋関数。
 *
 * `aggregateGlobalTopFeeds` で全ユーザーの engagement を集約して top-N feed を確定し、
 * 各 feed の最新 M 記事 (publishedAt 降順) から prefetch 対象 URL を抽出する。
 * link が空 / 重複は除外する。
 *
 * @param allUsersEntries 各ユーザーの engagement entries 配列
 * @param feedArticles feedHash → 最新記事配列 (publishedAt 降順)
 * @param opts prefetch 設定 (topN / maxArticlesPerFeed / minScore / now)
 * @param precomputedTopFeeds 呼出側で既に `aggregateGlobalTopFeeds` を実行済の場合に渡す。
 *   省略時は本関数内で再計算する (spec 互換のため)。`runCronPrefetch` 経路では同 args の重複計算を避けるために渡す。
 * @returns prefetch 対象 URL (重複排除済、feed の優先順位 × 記事の publishedAt 降順)
 */
export function selectPrefetchTargets(
  allUsersEntries: EngagementEntry[][],
  feedArticles: Map<string, Article[]>,
  opts: PrefetchOptions,
  precomputedTopFeeds?: GlobalFeedScore[],
): string[] {
  const topFeeds =
    precomputedTopFeeds ??
    aggregateGlobalTopFeeds(allUsersEntries, opts.topN, opts.now, opts.minScore);
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const { feedHash } of topFeeds) {
    const articles = feedArticles.get(feedHash) ?? [];
    for (const article of articles.slice(0, opts.maxArticlesPerFeed)) {
      if (!article.link) continue;
      if (seen.has(article.link)) continue;
      seen.add(article.link);
      urls.push(article.link);
    }
  }
  return urls;
}

/** OGP fetch + cache 書き込みのコア処理 (cron-prefetch 用 / route handler bypass)。 */
async function prefetchOgp(url: string, origin: string): Promise<void> {
  if (!isValidFeedUrl(url)) return;
  const cacheKey = await buildCacheKey(origin, "ogp", url);
  const cached = await matchCfCache(cacheKey);
  if (cached) return;

  const meta = await fetchPageOgpMeta(url, 5_000);
  const { image: rawImage, title, description } = meta;
  const image = isValidPublicUrl(unescapeHtml(rawImage)) ? rawImage : "";
  const hasContent = !!(image || title || description);
  const ttl = computeOgpCacheTtl({ hasContent, isFallback: false });
  await caches.default.put(cacheKey, buildJsonCacheResponse({ image, title, description }, ttl));
}

/**
 * cron 実行時の prefetch step。
 *
 * 1. 全ユーザー列挙 (buildFeedUserMapCached の KV cache 経由)
 * 2. 各ユーザーの engagement.json を取得
 * 3. aggregateGlobalTopFeeds で top-N feed を確定
 * 4. 各 feed の最新 M 件記事を読み出し
 * 5. selectPrefetchTargets で prefetch URL リスト構築
 * 6. 各 URL に対して content / OGP cache を確認 → MISS なら fetch + cache 書き込み
 *
 * Cloudflare Workers の subrequest 1000 件上限を超えないよう、デフォルト値は
 * topN=50 / maxArticlesPerFeed=3 で約 300 subrequest / 実行に抑えている。
 *
 * 失敗は無視 (cron 本体の RSS 取得を阻害しない)。
 */
export async function runCronPrefetch(
  env: { RSS_DATA: R2Bucket; RATE_LIMIT: KVNamespace },
  ctx: ExecutionContext,
  opts: PrefetchOptions = DEFAULT_PREFETCH_OPTIONS,
  origin = "https://rss.0g0.xyz",
): Promise<void> {
  try {
    const { feedUserMap } = await buildFeedUserMapCached(env.RSS_DATA, env.RATE_LIMIT);
    const userIds = [...new Set([...feedUserMap.values()].flat())];
    if (userIds.length === 0) return;

    const allEntries = await Promise.all(
      userIds.map((uid) =>
        r2Get<EngagementLog>(env.RSS_DATA, engagementKey(uid), { entries: [] }).then(
          (log) => log.entries,
        ),
      ),
    );

    const topFeeds = aggregateGlobalTopFeeds(allEntries, opts.topN, opts.now, opts.minScore);
    if (topFeeds.length === 0) return;

    const feedArticles = new Map<string, Article[]>();
    await pMapSettled(
      topFeeds,
      async ({ feedHash }) => {
        const articles = await readLatestArticles(env.RSS_DATA, feedHash);
        feedArticles.set(feedHash, articles);
      },
      10,
    );

    const urls = selectPrefetchTargets(allEntries, feedArticles, opts, topFeeds);
    if (urls.length === 0) return;

    await pMapSettled(
      urls,
      async (url) => {
        // 失敗は throw させず log のみ (cron 本体の RSS 取得を阻害しない)。
        // wrangler tail で per-URL の失敗理由を追えるようにする。
        await fetchArticleContent(url, origin, ctx).catch((err) =>
          console.error("[cron-prefetch] fetchArticleContent failed:", {
            url,
            err: formatError(err),
          }),
        );
        await prefetchOgp(url, origin).catch((err) =>
          console.error("[cron-prefetch] prefetchOgp failed:", { url, err: formatError(err) }),
        );
      },
      5,
    );

    console.log(`[cron-prefetch] prefetched ${urls.length} articles from ${topFeeds.length} feeds`);
  } catch (err) {
    console.error("[cron-prefetch] error:", formatError(err));
  }
}
