// @ts-ignore `.open-next/worker.js` はビルド時に生成される
import { default as handler } from "./.open-next/worker.js";
import { fetchAllFeeds } from "./src/cron/fetch";
import { runCronPrefetch } from "./src/lib/cron-prefetch";

export default {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  fetch: handler.fetch as ExportedHandler<CloudflareEnv>["fetch"],

  async scheduled(
    _controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    await fetchAllFeeds({
      RSS_DATA: env.RSS_DATA,
      FINDME_RSS: env.FINDME_RSS,
      RATE_LIMIT: env.RATE_LIMIT,
    });
    // #803 Phase 2: RSS 取得後に top-N feed の最新記事 content/OGP を prefetch
    // (subrequest 上限 1000 件を考慮して topN=50 / maxArticlesPerFeed=3 で約 300 件 / 実行)
    // 失敗は無視 (本体の RSS 取得を阻害しない、ctx.waitUntil で非同期実行)
    ctx.waitUntil(runCronPrefetch({ RSS_DATA: env.RSS_DATA, RATE_LIMIT: env.RATE_LIMIT }, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv>;
