// @ts-ignore `.open-next/worker.js` はビルド時に生成される
import { default as handler } from './.open-next/worker.js';
import { fetchAllUsers } from './src/cron/fetch';

export default {
  fetch: handler.fetch,

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, _ctx: ExecutionContext): Promise<void> {
    await fetchAllUsers({ RSS_DATA: env.RSS_DATA, FINDME_RSS: env.FINDME_RSS });
  },
} satisfies ExportedHandler<CloudflareEnv>;
