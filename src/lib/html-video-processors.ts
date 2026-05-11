/**
 * HTML 動画処理モジュール (#715)
 *
 * <video> / <source> 要素の src 属性を /api/video-proxy 経由に書き換える。
 * 冪等 (f(f(x)) === f(x))。data: / 相対 URL / プロキシ化済 URL は書き換えない。
 */
import { unescapeHtml } from "./html";

function isProxiedVideoUrl(url: string): boolean {
  return url.startsWith("/api/video-proxy?");
}

function rewriteSrcAttr(attrs: string): string {
  return attrs.replace(/\bsrc=["'](https?:\/\/[^"']+)["']/gi, (_match, src: string) => {
    if (isProxiedVideoUrl(src)) return _match;
    return `src="/api/video-proxy?url=${encodeURIComponent(unescapeHtml(src))}"`;
  });
}

/**
 * <video> / <source> タグの src 属性を /api/video-proxy 経由に書き換える純粋関数。
 *
 * - 絶対 URL (http/https) → プロキシ化
 * - data: / 相対 URL → 書き換えなし
 * - 既にプロキシ化済 (`/api/video-proxy?url=...`) → 書き換えなし (冪等)
 */
export function rewriteVideoUrls(html: string): string {
  let result = html.replace(/<video\b([^>]*)>/gi, (_match, attrs: string) => {
    return `<video${rewriteSrcAttr(attrs)}>`;
  });
  result = result.replace(/<source\b([^>]*)>/gi, (_match, attrs: string) => {
    return `<source${rewriteSrcAttr(attrs)}>`;
  });
  return result;
}
