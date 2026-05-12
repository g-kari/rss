import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError } from "@/lib/api-error";

/**
 * Piper TTS engine (#674 Phase 2c / closes #753) で使う `onnxruntime-web` の wasm ファイル
 * を R2 (`rss-reader-data/piper-wasm/<file>`) から fetch して serve する Route Handler。
 *
 * 背景:
 *   - Cloudflare Workers の単一 asset 上限は 25 MiB
 *   - `onnxruntime-web@1.26.0` の `ort-wasm-simd-threaded.jsep.wasm` がちょうど 25 MiB
 *     で抵触し、`.open-next/assets/_next/static/media/` 配下に bundle すると deploy
 *     が "Asset too large" で fail する
 *   - `scripts/remove-bundled-wasm.mjs` で bundle 後に wasm を削除 + 事前に R2 へ upload
 *     しておくことで、本 Route Handler 経由で fetch する設計に切替える
 *
 * クライアント側設定:
 *   `src/hooks/usePiperTts.ts` の `loadPiperLib` で
 *   `ort.env.wasm.wasmPaths = "/api/wasm/"` を設定し、ort runtime が自動で
 *   `"/api/wasm/" + filename` の形で fetch するようになる
 *
 * セキュリティ:
 *   - 任意 R2 オブジェクト参照を防ぐため `ALLOWED_FILES` allowlist で厳格に絞る
 *   - new file 種別を追加する場合は必ず本 allowlist と R2 upload を同時更新
 *
 * R2 upload 手順 (デプロイ前に手動 1 回):
 *   ```
 *   WASM_DIR=node_modules/.pnpm/onnxruntime-web@*\/node_modules/onnxruntime-web/dist
 *   for f in ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.jsep.wasm \
 *            ort-wasm-simd-threaded.asyncify.wasm ort-wasm-simd-threaded.jspi.wasm; do
 *     npx wrangler r2 object put rss-reader-data/piper-wasm/$f --file=$WASM_DIR/$f
 *   done
 *   ```
 */
const ALLOWED_FILES: ReadonlySet<string> = new Set([
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jspi.wasm",
]);

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!ALLOWED_FILES.has(file)) {
    return apiError("Not Found", 404, { code: "NOT_FOUND" });
  }
  const { env } = await getCloudflareContext({ async: true });
  const obj = await env.RSS_DATA.get(`piper-wasm/${file}`);
  if (!obj) {
    return apiError("Not Found", 404, { code: "NOT_FOUND" });
  }
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/wasm",
      // wasm ファイル名は version 固定 (npm package 内 plain 名)、内容も同 version で
      // 不変なので 1 年 immutable cache。新 version 採用時は ALLOWED_FILES 更新 +
      // R2 upload 時にファイル名を変える運用とする (CDN cache bust 不要)。
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
