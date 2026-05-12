// build:cf の post-step として `.open-next/assets/_next/static/media/` 配下の wasm ファイル
// を削除する (#674 Phase 2c / closes #753)。
//
// Cloudflare Workers のアセット上限 (25 MiB) を `onnxruntime-web` の
// `ort-wasm-simd-threaded.jsep.wasm` (25 MiB) が抵触してデプロイが
// "Asset too large" で fail する問題への対処。wasm は R2 (`piper-wasm/<file>`) に
// セルフホストして `/api/wasm/[file]` route handler 経由で fetch する設計
// (`src/hooks/usePiperTts.ts` で `ort.env.wasm.wasmPaths = "/api/wasm/"` 設定)。
//
// 削除した wasm は事前に R2 へ upload しておく必要がある:
//   for f in ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.jsep.wasm \
//            ort-wasm-simd-threaded.asyncify.wasm ort-wasm-simd-threaded.jspi.wasm; do
//     npx wrangler r2 object put rss-reader-data/piper-wasm/$f \
//       --file=node_modules/.pnpm/onnxruntime-web@*/node_modules/onnxruntime-web/dist/$f
//   done
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const MEDIA_DIR = ".open-next/assets/_next/static/media";

let entries;
try {
  entries = await readdir(MEDIA_DIR);
} catch (err) {
  if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
    console.log(`[remove-bundled-wasm] ${MEDIA_DIR} not found, skipping`);
    process.exit(0);
  }
  throw err;
}

let removed = 0;
let totalBytes = 0;
for (const f of entries) {
  if (!f.endsWith(".wasm")) continue;
  const p = join(MEDIA_DIR, f);
  const s = await stat(p);
  totalBytes += s.size;
  await rm(p);
  console.log(`[remove-bundled-wasm] removed ${f} (${(s.size / 1024 / 1024).toFixed(2)} MiB)`);
  removed++;
}
const totalMiB = (totalBytes / 1024 / 1024).toFixed(2);
console.log(`[remove-bundled-wasm] total: ${removed} file(s), ${totalMiB} MiB removed`);
