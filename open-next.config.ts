import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();

// NOTE: Cron ハンドラー (scheduled) は @opennextjs/cloudflare では未サポート。
// ビルド後 .open-next/worker.js に scheduled エクスポートを追加するか、
// 専用の Workers スクリプトで対応する。
