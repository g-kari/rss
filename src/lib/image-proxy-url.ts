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
 */
export function buildImageProxyUrl(url: string): string {
  if (isProxiedImageUrl(url)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/** 与えられた文字列が image-proxy 経由の相対 URL かどうかを判定する */
export function isProxiedImageUrl(url: string): boolean {
  return url.startsWith("/api/image-proxy?");
}
