import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiError } from "@/lib/api-error";

/**
 * Piper TTS engine (#761 / piper-plus library 採用) で使う voice モデル (.onnx) と
 * config (.onnx.json) を R2 (`rss-reader-data/piper-voices/<file>`) から fetch して serve する
 * Route Handler。
 *
 * 背景:
 *   - piper-plus の `model:` option はカスタム URL を受け取れる
 *   - voice ファイル (.onnx) は数十 MB なので bundle に含めず R2 セルフホスト
 *   - config (`<model-url>.json`) は piper-plus が同 path から自動 fetch する仕様
 *
 * クライアント側設定:
 *   `src/lib/piper-voices.ts` の `PIPER_PLUS_VOICES` で model URL を
 *   `/api/piper-voice/<id>.onnx` 形式で指定。
 *
 * セキュリティ:
 *   - 任意 R2 オブジェクト参照を防ぐため `ALLOWED_FILES` allowlist で厳格に絞る
 *   - 新 voice を追加する場合は本 allowlist + `PIPER_PLUS_VOICES` + R2 upload を
 *     `scripts/upload-piper-voices.mjs` で同期更新
 */
const ALLOWED_FILES: ReadonlySet<string> = new Set(["tsukuyomi.onnx", "tsukuyomi.onnx.json"]);

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!ALLOWED_FILES.has(file)) {
    return apiError("Not Found", 404, { code: "NOT_FOUND" });
  }
  const { env } = await getCloudflareContext({ async: true });
  const obj = await env.RSS_DATA.get(`piper-voices/${file}`);
  if (!obj) {
    return apiError("Not Found", 404, { code: "NOT_FOUND" });
  }
  // .onnx.json は JSON、.onnx は ONNX バイナリ (application/octet-stream)
  const contentType = file.endsWith(".json") ? "application/json" : "application/octet-stream";
  return new Response(obj.body, {
    headers: {
      "Content-Type": contentType,
      // voice ファイル名は version 固定 (HF revision 単位)、内容不変なので 1 年 immutable
      // 新 version 採用時は ALLOWED_FILES + R2 upload 時にファイル名を変える運用
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
