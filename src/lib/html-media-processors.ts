/**
 * HTML メディア (image / video) URL の proxy 統合書き換え純粋関数 (#752 採用案 B)。
 *
 * `html-image-processors.ts#rewriteImageUrls` と `html-video-processors.ts#rewriteVideoUrls`
 * の重複コアロジックを統合。`<img>` / `<video>` / `<source>` 等の任意タグ集合と
 * proxy path を options で受け取り、絶対 URL を `/api/<proxyPath>?url=...` に書き換える。
 *
 * 冪等 (`f(f(x)) === f(x)`): 既プロキシ化済 URL (`/api/<proxyPath>?...` プレフィックス) は
 * skip。data: / 相対 URL も skip (絶対 URL `https?://` のみ rewrite)。
 *
 * 後方互換: 既存 `rewriteImageUrls` / `rewriteVideoUrls` は本関数の thin wrapper として
 * `html-image-processors.ts` / `html-video-processors.ts` 内に残し、caller (content.ts /
 * html-post-processor.ts 等) は import path 変更不要。
 */

import { unescapeHtml } from "./html";
import { transformSrcset } from "./html-srcset";
import { isAbsoluteHttpUrl } from "./url";

export interface RewriteMediaSrcOptions {
  /** 対象タグ名の配列 (例: `["img"]` / `["video", "source"]`) */
  readonly tags: readonly string[];
  /** proxy path (例: `"image-proxy"` / `"video-proxy"`)、`/api/` prefix は不要 */
  readonly proxyPath: string;
  /** `srcset` 属性も rewrite するか (image のみ true、video / source は不要なので未指定 = false) */
  readonly srcset?: boolean;
}

function rewriteSrcAttr(attrs: string, proxyPath: string): string {
  // `(?<![a-zA-Z-])` で `data-src=` / `lowsrc=` 等の prefix を除外 (#895)。
  // `\bsrc=` だと `data-src=` の `-src=` 部分にも誤マッチして data-src の値も proxy 化される regex バグ。
  return attrs.replace(/(?<![a-zA-Z-])src=["'](https?:\/\/[^"']+)["']/gi, (match, src: string) => {
    // 冪等性ガード: 既プロキシ化済なら skip (src が `https?://` で始まるので通常マッチしないが念のため)
    if (src.startsWith(`/api/${proxyPath}?`)) return match;
    return `src="/api/${proxyPath}?url=${encodeURIComponent(unescapeHtml(src))}"`;
  });
}

function rewriteSrcsetAttr(attrs: string, proxyPath: string): string {
  // `(?<![a-zA-Z-])` で `data-srcset=` 等の prefix を除外 (#895)。`\bsrcset=` は誤マッチする。
  return attrs.replace(/(?<![a-zA-Z-])srcset=["']([^"']+)["']/gi, (_match, srcset: string) => {
    const proxied = transformSrcset(srcset, (url) => {
      if (!isAbsoluteHttpUrl(url)) return url;
      return `/api/${proxyPath}?url=${encodeURIComponent(unescapeHtml(url))}`;
    });
    return `srcset="${proxied}"`;
  });
}

/**
 * HTML 内の指定タグの `src` (オプションで `srcset`) を proxy URL に書き換える統合純粋関数。
 *
 * 例:
 * - image: `rewriteMediaSrcAttrs(html, { tags: ["img"], proxyPath: "image-proxy", srcset: true })`
 * - video: `rewriteMediaSrcAttrs(html, { tags: ["video", "source"], proxyPath: "video-proxy" })`
 */
const _tagReCache = new Map<string, RegExp>();

export function rewriteMediaSrcAttrs(html: string, opts: RewriteMediaSrcOptions): string {
  let result = html;
  for (const tag of opts.tags) {
    let tagRe = _tagReCache.get(tag);
    if (!tagRe) {
      tagRe = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
      _tagReCache.set(tag, tagRe);
    }
    result = result.replace(tagRe, (_match, attrs: string) => {
      let rewritten = rewriteSrcAttr(attrs, opts.proxyPath);
      if (opts.srcset) {
        rewritten = rewriteSrcsetAttr(rewritten, opts.proxyPath);
      }
      return `<${tag}${rewritten}>`;
    });
  }
  return result;
}
