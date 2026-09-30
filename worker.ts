// @ts-ignore `.open-next/worker.js` はビルド時に生成される
import { default as handler } from "./.open-next/worker.js";
import { fetchAllFeeds } from "./src/cron/fetch";
import { runRecommendationPush } from "./src/cron/recommendations";
import { runCronPrefetch } from "./src/lib/cron-prefetch";
import { feedWriteMaintenanceResponse, isFeedWritesPaused } from "./src/lib/feed-write-maintenance";

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const openNextFetch = handler.fetch as NonNullable<ExportedHandler<CloudflareEnv>["fetch"]>;

export default {
  fetch(...[request, env, ctx]: Parameters<typeof openNextFetch>) {
    const maintenance = feedWriteMaintenanceResponse(request, env.RSS_FEED_WRITES_PAUSED);
    if (maintenance) return maintenance;
    // Preserve the original handler arguments and Worker receiver.
    return openNextFetch.call(this, request, env, ctx);
  },

  async scheduled(
    _controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    // This prevents new work; already-running invocations must be drained at rollout.
    if (isFeedWritesPaused(env.RSS_FEED_WRITES_PAUSED)) return;
    await fetchAllFeeds({
      RSS_DATA: env.RSS_DATA,
      FINDME_RSS: env.FINDME_RSS,
      RATE_LIMIT: env.RATE_LIMIT,
      ARTICLE_SEARCH: env.ARTICLE_SEARCH,
      RSS_FEED_WRITES_PAUSED: env.RSS_FEED_WRITES_PAUSED,
      RSS_ARTICLE_STORAGE_V2: env.RSS_ARTICLE_STORAGE_V2,
      RSS_ARTICLE_SEARCH_INDEX: env.RSS_ARTICLE_SEARCH_INDEX,
    });
    // Recommendations share the existing 30-minute schedule; no browser needs to stay open.
    try {
      await runRecommendationPush(env, Date.now());
    } catch (error) {
      console.error(
        "[recommendation-push] scheduled run failed",
        error instanceof Error ? error.message : "unknown failure",
      );
    }
    // #803 Phase 2: RSS 取得後に top-N feed の最新記事 content/OGP を prefetch
    // (subrequest 上限 1000 件を考慮して topN=50 / maxArticlesPerFeed=3 で約 300 件 / 実行)
    // 失敗は無視 (本体の RSS 取得を阻害しない、ctx.waitUntil で非同期実行)
    ctx.waitUntil(runCronPrefetch({ RSS_DATA: env.RSS_DATA, RATE_LIMIT: env.RATE_LIMIT }, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv>;
