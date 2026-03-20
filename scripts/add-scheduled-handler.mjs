/**
 * Post-build script: Cron ハンドラーを .open-next/worker.js に追加する
 *
 * @opennextjs/cloudflare は scheduled イベントをサポートしていないため、
 * ビルド後に scheduled エクスポートを worker.js に追記する。
 * esbuild で src/cron/fetch.ts をバンドルし、その成果物を動的 import して使用する。
 */

import { readFileSync, writeFileSync } from 'fs';
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
