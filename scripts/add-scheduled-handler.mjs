/**
 * Post-build script:
 * OpenNext 生成の wrangler.json に wrangler.toml の追加設定をマージする
 *
 * scheduled ハンドラーは worker.ts (Custom Worker) で定義済みのため、
 * このスクリプトでの注入は不要。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

// dist/rss_reader/wrangler.json に不足バインディングをマージ
// このファイルは opennextjs-cloudflare deploy 時に生成されるため、
// CI のビルドステップでは存在しない場合がある → その場合はスキップ
const WRANGLER_JSON_PATH = 'dist/rss_reader/wrangler.json';
if (!existsSync(WRANGLER_JSON_PATH)) {
  console.log('dist/rss_reader/wrangler.json not found, skipping wrangler.json patch');
  process.exit(0);
}
const wranglerJson = JSON.parse(readFileSync(WRANGLER_JSON_PATH, 'utf-8'));

// global_fetch_strictly_public フラグを追加
if (!wranglerJson.compatibility_flags.includes('global_fetch_strictly_public')) {
  wranglerJson.compatibility_flags.push('global_fetch_strictly_public');
}

// NEXT_INC_CACHE_R2_BUCKET を追加
const hasCache = wranglerJson.r2_buckets?.some((b) => b.binding === 'NEXT_INC_CACHE_R2_BUCKET');
if (!hasCache) {
  wranglerJson.r2_buckets = [
    ...(wranglerJson.r2_buckets ?? []),
    { binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'rss-reader-cache' },
  ];
}

// WORKER_SELF_REFERENCE サービスバインディングを追加
const hasSelfRef = wranglerJson.services?.some((s) => s.binding === 'WORKER_SELF_REFERENCE');
if (!hasSelfRef) {
  wranglerJson.services = [
    ...(wranglerJson.services ?? []),
    { binding: 'WORKER_SELF_REFERENCE', service: 'rss-reader' },
  ];
}

// FINDME_RSS サービスバインディングを追加
const hasFindmeRss = wranglerJson.services?.some((s) => s.binding === 'FINDME_RSS');
if (!hasFindmeRss) {
  wranglerJson.services = [
    ...(wranglerJson.services ?? []),
    { binding: 'FINDME_RSS', service: 'findme-rss' },
  ];
}

// IMAGES バインディングを追加
if (!wranglerJson.images) {
  wranglerJson.images = { binding: 'IMAGES' };
}

writeFileSync(WRANGLER_JSON_PATH, JSON.stringify(wranglerJson, null, 2));
console.log('wrangler.json patched with extra bindings');
