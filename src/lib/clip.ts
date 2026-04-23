/**
 * SingleFile 連携 — リクエストバリデーション
 *
 * SingleFile ブラウザ拡張から POST された HTML をキャッシュに保存するための
 * バリデーション純粋関数。
 */

// ===== リクエスト検証 =====

interface ClipRequest {
  html?: unknown;
  url?: unknown;
}

type ValidateOk = { ok: true; html: string; url: string };
type ValidateError = { ok: false; error: string };
type ValidateResult = ValidateOk | ValidateError;

/**
 * SingleFile POST リクエストのペイロードを検証する。
 *
 * - html: 空でない文字列であること
 * - url: http:// または https:// で始まる有効な URL であること
 */
export function validateClipRequest(req: ClipRequest): ValidateResult {
  const { html, url } = req;

  if (typeof html !== "string" || html.trim() === "") {
    return { ok: false, error: "html は空でない文字列が必要です" };
  }

  const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB
  if (html.length > MAX_HTML_BYTES || new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
    return { ok: false, error: "HTML が大きすぎます（上限 5MB）" };
  }

  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, error: "url は空でない文字列が必要です" };
  }

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "url は http:// または https:// で始まる必要があります" };
  }

  return { ok: true, html, url };
}
