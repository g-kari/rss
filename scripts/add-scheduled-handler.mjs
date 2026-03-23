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
let worker = readFileSync(WORKER_PATH, 'utf-8');

// fetchAllUsers が含まれていればスケジュールハンドラーはパッチ済み
// NOTE: 汎用的な `scheduled(` では Next.js 内部コードにマッチして誤判定するため
//       自分たちが挿入した固有シンボルで判定する
if (worker.includes('fetchAllUsers')) {
  console.log('scheduled handler already present, skipping scheduled patch');
} else {
  const scheduledBlock = `    async scheduled(_event, env, _ctx) {
        //@ts-expect-error: bundled cron module
        const { fetchAllUsers } = await import("./cron.js");
        await fetchAllUsers({ RSS_DATA: env.RSS_DATA, FINDME_RSS: env.FINDME_RSS });
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

  worker = patched;
  writeFileSync(WORKER_PATH, worker);
  console.log('scheduled handler added to worker.js');
}

// 3. prefetch-hints.json の loadManifest 呼び出しを無害化する
//    Next.js 16.2+ が追加した prefetch-hints.json は @opennextjs/cloudflare の
//    ビルド時グロブ (**/{*-manifest,required-server-files}.json) にマッチしないため
//    実行時に "Unexpected loadManifest" エラーが発生する。
//    throw の直前に空オブジェクトを返す分岐を挿入してエラーを回避する。
//    NOTE: スケジュールパッチとは独立して毎回実行する（早期 exit しない）
const workerAfterCron = readFileSync(WORKER_PATH, 'utf-8');
const prefetchPatch = workerAfterCron.replace(
  /throw new Error\(\s*`Unexpected loadManifest\(\$\{([^}]+)\}\) call!`\s*\)/,
  'if ($1.endsWith("server/prefetch-hints.json")) { return {}; }\n  throw new Error(`Unexpected loadManifest(${$1}) call!`)',
);
if (prefetchPatch === workerAfterCron) {
  console.warn('prefetch-hints patch: pattern not found in worker.js — may need regex update');
} else {
  writeFileSync(WORKER_PATH, prefetchPatch);
  console.log('prefetch-hints.json loadManifest patch applied to worker.js');
}

// 4. dist/rss_reader/wrangler.json に不足バインディングをマージ
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
