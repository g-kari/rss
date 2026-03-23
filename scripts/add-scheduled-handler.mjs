/**
 * Post-build script:
 *  1. prefetch-hints.json の loadManifest エラーを無害化する
 *  2. OpenNext 生成の wrangler.json に wrangler.toml の追加設定をマージする
 *
 * scheduled ハンドラーは worker.ts (Custom Worker) で定義済みのため、
 * このスクリプトでの注入は不要。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

// 1. prefetch-hints.json の loadManifest 呼び出しを無害化する
//    Next.js 16.2+ が追加した prefetch-hints.json は @opennextjs/cloudflare の
//    ビルド時グロブ (**/{*-manifest,required-server-files}.json) にマッチしないため
//    実行時に "Unexpected loadManifest" エラーが発生する。
//    ※パッチ対象は .open-next/worker.js ではなく、
//      @opennextjs/cloudflare がバンドル済みの handler.mjs
const HANDLER_PATH = '.open-next/server-functions/default/handler.mjs';
if (!existsSync(HANDLER_PATH)) {
  console.warn(`prefetch-hints patch: ${HANDLER_PATH} not found, skipping`);
} else {
  const handlerSrc = readFileSync(HANDLER_PATH, 'utf-8');
  // バックティックは \x60 でエスケープ、変数名（path2 等）を動的にキャプチャ
  const prefetchPatch = handlerSrc.replace(
    /throw new Error\(\x60Unexpected loadManifest\(\$\{([^}]+)\}\) call!\x60\)/,
    'if ($1.endsWith("server/prefetch-hints.json")) { return {}; } throw new Error(`Unexpected loadManifest(${$1}) call!`)',
  );
  if (prefetchPatch === handlerSrc) {
    console.warn('prefetch-hints patch: pattern not found in handler.mjs — may need regex update');
  } else {
    writeFileSync(HANDLER_PATH, prefetchPatch);
    console.log('prefetch-hints.json loadManifest patch applied to handler.mjs');
  }
}

// 2. dist/rss_reader/wrangler.json に不足バインディングをマージ
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
