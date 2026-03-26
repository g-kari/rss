// @ts-ignore `.open-next/worker.js` はビルド時に生成される
import { default as handler } from './.open-next/worker.js';
import { fetchAllFeeds } from './src/cron/fetch';

export default {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  fetch: handler.fetch as ExportedHandler<CloudflareEnv>['fetch'],

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, _ctx: ExecutionContext): Promise<void> {
    await fetchAllFeeds({ RSS_DATA: env.RSS_DATA, FINDME_RSS: env.FINDME_RSS });
  },
} satisfies ExportedHandler<CloudflareEnv>;
