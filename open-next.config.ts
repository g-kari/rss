import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});

// NOTE: Cron ハンドラー (scheduled) は @opennextjs/cloudflare では未サポート。
// 本プロジェクトは worker.ts (Custom Worker、wrangler.toml `main = "./worker.ts"`) で
// scheduled handler を直接定義し、.open-next/worker.js (Next.js handler) を fetch に delegate
// する 2 段構成で対処している。scripts/add-scheduled-handler.mjs は wrangler.json への
// bindings マージ専用 (scheduled handler 注入は実施しない、build:cf 参照)。
