/**
 * `/api/image-proxy?url=...` 形式のプロキシ URL を組み立てるユーティリティ。
 *
 * Issue #125: サムネイルや OGP 画像として受け取った値が、何らかの経緯で
 * 既に `/api/image-proxy?url=...` 形式になっている場合に `encodeURIComponent`
 * で再ラップすると、`/api/image-proxy?url=%2Fapi%2Fimage-proxy%3F...` のような
 * 二重ラップが発生する。ここで一元的に防御する。
 *
 * - 絶対 URL (http/https): `/api/image-proxy?url=<encoded>` に変換
 * - 既にプロキシ化済みの相対 URL (`/api/image-proxy?url=...`): そのまま返す
 * - それ以外: そのまま返す（呼び出し側でバリデーション済みの想定）
 *
 * #812 真因防御: caller (ArticleContentBody.tsx の `(resolvedOgImage ?? article.ogImage)!`
 * non-null assertion 等) から型保証を破って non-string が runtime 混入する経路がある
 * (cache 旧 schema / OGP 旧 fetch result object 形式 / API edge case 等)。
 * 後続の `url.startsWith` で本番 minified bundle TypeError → ErrorBoundary 発火を
 * 発生させていた。非 string / 空文字は空文字 fallback で safe (UX 影響: 画像 0 件描画
 * < ErrorBoundary 発火)。`react-component-split.md § 派生「JSX 描画 helper unknown 受け
 * defensive」` 規範。
 */
export function buildImageProxyUrl(url: unknown): string {
  if (typeof url !== "string" || url === "") return "";
  if (isProxiedImageUrl(url)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/** 与えられた文字列が image-proxy 経由の相対 URL かどうかを判定する */
export function isProxiedImageUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  return url.startsWith("/api/image-proxy?");
}
