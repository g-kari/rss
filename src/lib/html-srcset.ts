/**
 * HTML `srcset` 属性のパース + URL 変換純粋関数 (#752)。
 *
 * `html-image-processors.ts` から分離。`html-media-processors.ts` (新統合ヘルパー) も
 * 参照するため、独立 module にして circular import を回避する。
 */

/**
 * `srcset` 文字列を url ごとに rewrite する。
 *
 * HTML srcset 仕様 (https://html.spec.whatwg.org/#parse-a-srcset-attribute) に寄せたパース。
 * URL は whitespace までを境界とし、URL 末尾の `,` のみ候補区切りとして扱う。
 * これにより Cloudinary のように path 内に生の `,` を含む URL (`c_limit,f_auto,...` 等) でも壊れない。
 */
export function transformSrcset(srcset: string, rewriteUrl: (url: string) => string): string {
  const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
  const parts: string[] = [];
  let i = 0;
  const s = srcset;
  while (i < s.length) {
    while (i < s.length && (isWs(s[i]) || s[i] === ",")) i++;
    if (i >= s.length) break;
    const urlStart = i;
    while (i < s.length && !isWs(s[i])) i++;
    let url = s.slice(urlStart, i);
    let descriptor = "";
    // URL 末尾に付く `,` は候補区切り。複数付いていても取り除く。
    let trailingComma = false;
    while (url.endsWith(",")) {
      url = url.slice(0, -1);
      trailingComma = true;
    }
    if (!trailingComma) {
      while (i < s.length && isWs(s[i])) i++;
      const dStart = i;
      while (i < s.length && s[i] !== ",") i++;
      descriptor = s.slice(dStart, i).trim();
      if (i < s.length && s[i] === ",") i++;
    }
    if (!url) continue;
    const out = rewriteUrl(url);
    parts.push(descriptor ? `${out} ${descriptor}` : out);
  }
  return parts.join(", ");
}
