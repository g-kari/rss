/**
 * SingleFile 連携 — リクエストバリデーション・キャッシュキー生成
 *
 * SingleFile ブラウザ拡張から POST された HTML をキャッシュに保存するための
 * バリデーションとキャッシュキー生成の純粋関数。
 *
 * キャッシュキーは /api/content ルートと同じ形式を使用する。
 */

import { sha256Hex } from "./r2";

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

  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, error: "url は空でない文字列が必要です" };
  }

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "url は http:// または https:// で始まる必要があります" };
  }

  return { ok: true, html, url };
}

// ===== キャッシュキー生成 =====

/**
 * /api/content ルートと同じキャッシュキー形式でキー文字列を返す。
 *
 * キー形式: `{origin}/__cache/content/{sha256hex(url)}`
 *
 * @param origin - RSS リーダーの origin (例: https://rss.0g0.xyz)
 * @param url - クリップした記事の URL
 * @returns キャッシュキーとなる文字列
 */
export async function clipCacheKey(origin: string, url: string): Promise<string> {
  const hash = await sha256Hex(url);
  return `${origin}/__cache/content/${hash}`;
}
