import { withBinarySession } from "@/lib/server-auth";
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
 * R2 upload 手順 (新規環境 / onnxruntime-web バージョンアップ時):
 *   ```
 *   npx wrangler login  # 初回のみ
 *   npm run upload:piper-wasm
 *   ```
 *
 *   実体は `scripts/upload-piper-wasm.mjs` (pnpm hash 化 path 自動解決 + 4 ファイル順次
 *   upload + 失敗時 exit 1)。ALLOWED_FILES と script 内 WASM_FILES を同期更新すること。
 */
const ALLOWED_FILES: ReadonlySet<string> = new Set([
  // onnxruntime-web wasm (peer dep) — `.wasm` バイナリ本体
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jspi.wasm",
  // onnxruntime-web `.mjs` ローダー (`.wasm` 本体と対で必要、threaded mode で fetch される)
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.jspi.mjs",
  // piper-plus Rust phonemizer wasm (#761) — loader JS が同 path から bg.wasm を fetch
  "piper_plus_wasm.js",
  "piper_plus_wasm_bg.wasm",
]);

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!ALLOWED_FILES.has(file)) {
    return apiError("Not Found", 404, { code: "NOT_FOUND" });
  }
  return withBinarySession(request, async ({ env }) => {
    const obj = await env.RSS_DATA.get(`piper-wasm/${file}`);
    if (!obj) {
      return apiError("Not Found", 404, { code: "NOT_FOUND" });
    }
    // `.js` / `.mjs` (ES module loader) は application/javascript で配信、`.wasm` は wasm として配信
    const isJsLoader = file.endsWith(".js") || file.endsWith(".mjs");
    const contentType = isJsLoader ? "application/javascript" : "application/wasm";
    return new Response(obj.body, {
      headers: {
        "Content-Type": contentType,
        // ファイル名は version 固定 (npm package 内 plain 名)、内容も同 version で不変なので
        // 1 年 immutable cache。新 version 採用時は ALLOWED_FILES 更新 + R2 upload 時に
        // ファイル名を変える運用とする (CDN cache bust 不要)。
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });
}
