/**
 * Post-build script:
 *  1. Cron ハンドラーを .open-next/worker.js に追加する
 *  2. OpenNext 生成の wrangler.json に wrangler.toml の追加設定をマージする
 *
 * @opennextjs/cloudflare は scheduled イベントや一部バインディングを
 * 生成 wrangler.json に反映しないため、ビルド後にパッチを当てる。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { build } from 'esbuild';
import { resolve } from 'path';

const WORKER_PATH = '.open-next/worker.js';
const CRON_BUNDLE_PATH = '.open-next/cron.js';
const CRON_ENTRY = 'src/cron/fetch.ts';

// 1. src/cron/fetch.ts をバンドル
await build({
  entryPoints: [CRON_ENTRY],
  bundle: true,
  outfile: CRON_BUNDLE_PATH,
  format: 'esm',
  target: 'esnext',
  platform: 'browser', // Workers 互換
  conditions: ['workerd'],
  minify: false,
  // path alias @/ を src/ に解決
  alias: { '@': resolve('src') },
});

console.log(`Cron bundle written to ${CRON_BUNDLE_PATH}`);

// 2. worker.js に scheduled ハンドラーを追記
const worker = readFileSync(WORKER_PATH, 'utf-8');

// すでにパッチ済みなら何もしない
if (worker.includes('scheduled(')) {
  console.log('scheduled handler already present, skipping patch');
  process.exit(0);
}

const scheduledBlock = `    async scheduled(_event, env, _ctx) {
        //@ts-expect-error: bundled cron module
        const { fetchAllUsers } = await import("./cron.js");
        await fetchAllUsers({ RSS_DATA: env.RSS_DATA });
    },
`;

// export default { ... } の fetch の前に scheduled を挿入
const patched = worker.replace(
  'export default {',
  `export default {\n${scheduledBlock}`,
);

if (patched === worker) {
  console.error('Failed to patch worker.js: export default { not found');
  process.exit(1);
}

writeFileSync(WORKER_PATH, patched);
console.log('scheduled handler added to worker.js');

// 3. dist/rss_reader/wrangler.json に不足バインディングをマージ
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

// IMAGES バインディングを追加
if (!wranglerJson.images) {
  wranglerJson.images = { binding: 'IMAGES' };
}

writeFileSync(WRANGLER_JSON_PATH, JSON.stringify(wranglerJson, null, 2));
console.log('wrangler.json patched with extra bindings');
