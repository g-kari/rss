import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});

// NOTE: Cron ハンドラー (scheduled) は @opennextjs/cloudflare では未サポート。
// scripts/add-scheduled-handler.mjs でビルド後に worker.js に追記する (build:cf 参照)。
