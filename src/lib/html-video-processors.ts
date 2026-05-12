/**
 * HTML 動画処理モジュール (#715、#752 で thin wrapper 化)
 *
 * <video> / <source> 要素の src 属性を /api/video-proxy 経由に書き換える。
 * 冪等 (f(f(x)) === f(x))。data: / 相対 URL / プロキシ化済 URL は書き換えない。
 * 実体は `html-media-processors.ts#rewriteMediaSrcAttrs`。
 */
import { rewriteMediaSrcAttrs } from "./html-media-processors";

/**
 * <video> / <source> タグの src 属性を /api/video-proxy 経由に書き換える純粋関数。
 *
 * - 絶対 URL (http/https) → プロキシ化
 * - data: / 相対 URL → 書き換えなし
 * - 既にプロキシ化済 (`/api/video-proxy?url=...`) → 書き換えなし (冪等)
 */
export function rewriteVideoUrls(html: string): string {
  return rewriteMediaSrcAttrs(html, { tags: ["video", "source"], proxyPath: "video-proxy" });
}
