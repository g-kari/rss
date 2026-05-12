// Piper TTS engine 用 wasm (onnxruntime-web) を Cloudflare R2 にアップロードする script
// (#674 Phase 2c / #753)。
//
// 背景:
//   Cloudflare Workers の単一 asset 上限 (25 MiB) に `ort-wasm-simd-threaded.jsep.wasm`
//   (25.02 MiB) が抵触するため、wasm を bundle に含めず R2 (`piper-wasm/<file>`) に事前
//   upload + `/api/wasm/[file]` route handler 経由で fetch する設計
//   (詳細: `.claude/rules/cloudflare-constraints.md` の「Cloudflare Workers 単一 asset
//   25 MiB 上限への対処」セクション)。
//
// 使い方:
//   npx wrangler login  # 初回のみ
//   npm run upload:piper-wasm
//
// 再 upload が必要なタイミング:
//   1. `onnxruntime-web` のバージョンアップ (= wasm バイナリ更新)
//   2. R2 オブジェクト破損 / 削除時のリカバリ
//
// 失敗時の挙動:
//   1 ファイルでも upload 失敗すれば exit code 1 を返す。CI への組込みは想定していない
//   (production R2 を上書きするため運用判断要)。
import { readdir } from "node:fs/promises";
import { execSync } from "node:child_process";

const BUCKET = "rss-reader-data";
const R2_PREFIX = "piper-wasm";
const WASM_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jspi.wasm",
];

const PNPM_BASE = "node_modules/.pnpm";

/** pnpm の hash 化された path を解決して onnxruntime-web の dist dir を返す */
async function locateWasmDir() {
  let entries;
  try {
    entries = await readdir(PNPM_BASE);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      throw new Error(
        `${PNPM_BASE} not found. Run \`pnpm install\` first to ensure onnxruntime-web is available.`,
      );
    }
    throw err;
  }
  const ortDir = entries.find((d) => d.startsWith("onnxruntime-web@"));
  if (!ortDir) {
    throw new Error(
      `onnxruntime-web not found in ${PNPM_BASE}. Verify it is listed in package.json dependencies.`,
    );
  }
  return `${PNPM_BASE}/${ortDir}/node_modules/onnxruntime-web/dist`;
}

const wasmDir = await locateWasmDir();
console.log(`[upload-piper-wasm] source dir: ${wasmDir}`);
console.log(`[upload-piper-wasm] target:     r2://${BUCKET}/${R2_PREFIX}/`);

let success = 0;
let failed = 0;
for (const f of WASM_FILES) {
  console.log(`\n===== uploading ${f} =====`);
  try {
    execSync(
      `npx wrangler r2 object put "${BUCKET}/${R2_PREFIX}/${f}" --file="${wasmDir}/${f}" --remote`,
      { stdio: "inherit" },
    );
    success++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[upload-piper-wasm] FAILED: ${f}`);
    console.error(`  ${msg}`);
    failed++;
  }
}

console.log(`\n[upload-piper-wasm] complete: ${success} success / ${failed} failed`);
if (failed > 0) process.exit(1);
