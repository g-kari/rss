/**
 * image-proxy エンドポイント向けセキュリティ検証ユーティリティ。
 *
 * 目的:
 *  - 他オリジンからの直接プロキシ利用を防ぎ、CSP (`img-src 'self'`) を実質的に保護する
 *  - Content-Type ヘッダーの偽装によるキャッシュ汚染を防止する
 */

/**
 * 同一オリジンからの画像リクエストかを判定する。
 *
 * Sec-Fetch-Site ヘッダー (modern browsers) が `same-origin` の場合のみ許可する。
 * Sec-Fetch-Site が存在しない場合（curl 等の非ブラウザクライアント）は拒否する（fail-closed）。
 *
 * ※ 旧来の Referer フォールバックは HTTP レベルで偽造可能なため廃止 (#493)。
 *    有効なセッション Cookie を持つ攻撃者が Referer を偽装してプロキシを濫用できる問題を防ぐ。
 */
export function isSameOriginImageRequest(headers: Headers, _selfOrigin: string): boolean {
  // Sec-Fetch-Mode が "navigate" の場合はブラウザの直接ナビゲーションリクエストであり、
  // 画像プロキシへの正当な利用ではないため拒否する。
  // （例: アドレスバーへの URL 直打ち、<a href> でのページ遷移など）
  const secFetchMode = headers.get("sec-fetch-mode");
  if (secFetchMode === "navigate") {
    return false;
  }

  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin";
  }

  // Sec-Fetch-Site が存在しない（非モダンブラウザ / curl 等）場合は拒否する（fail-closed）。
  // 旧来の Referer フォールバックは HTTP レベルで偽造可能なため廃止 (#493)。
  // 画像プロキシへの正当なリクエストはブラウザの <img> タグ経由であり、
  // Sec-Fetch-Site ヘッダーを付与しないクライアントからの利用は想定しない。
  return false;
}

/**
 * HTTP レスポンスの Content-Type ヘッダーが、マジックバイト検出結果と矛盾しないことを検証する。
 *
 * - 宣言が空 / `application/octet-stream` の場合はマジックバイト側の判定を信頼
 * - 宣言が `image/*` ならマジックバイト由来の MIME と一致することを要求
 * - 非画像宣言は常に拒否
 *
 * `image/jpg` と `image/jpeg` は同一とみなす。
 */
export function isContentTypeConsistent(declared: string, detected: string): boolean {
  const d = declared.toLowerCase().trim();
  if (d === "" || d === "application/octet-stream") return true;
  return normalizeImageMime(d) === normalizeImageMime(detected);
}

function normalizeImageMime(mime: string): string {
  return mime === "image/jpg" ? "image/jpeg" : mime;
}
