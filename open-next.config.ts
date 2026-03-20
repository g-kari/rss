import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();

// NOTE: Cron ハンドラー (scheduled) は @opennextjs/cloudflare では未サポート。
// scripts/add-scheduled-handler.mjs でビルド後に worker.js に追記する (build:cf 参照)。
