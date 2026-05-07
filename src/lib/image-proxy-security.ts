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
 * 優先度:
 *   1. Sec-Fetch-Site ヘッダー (modern browsers) — `same-origin` のみ許可
 *   2. Referer ヘッダー — origin が self と一致する場合のみ許可
 *      ※ Referer は HTTP レベルで偽造可能なため curl 等からバイパスされ得る（LOW リスク）。
 *        画像プロキシには checkSlidingWindow レートリミットがあるため実用上の乱用は抑制される。
 *
 * どちらも存在しない・判定できない場合は拒否する（fail-closed）。
 */
export function isSameOriginImageRequest(headers: Headers, selfOrigin: string): boolean {
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

  // Referer ヘッダーによるフォールバック。
  // ⚠️ Referer は HTTP レベルで偽造可能なため curl 等の非ブラウザクライアントからバイパスされ得る。
  // ただし画像プロキシには checkSlidingWindow レートリミットがあるため実用上の乱用は抑制される。
  const referer = headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === selfOrigin;
  } catch {
    return false;
  }
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
