import { tryParseBase } from "./url";

/** CSRF 保護を必須とする HTTP メソッド（状態変更系） */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF 対策: 状態変更系リクエスト (POST/PUT/PATCH/DELETE) について
 * Origin または Referer ヘッダーの origin が `appBaseUrl` と一致するかを検証する。
 *
 * - GET / HEAD / OPTIONS は safe method として常に合格（RFC 7231）
 * - Origin ヘッダーがある場合はそちらを使い、Referer へのフォールバックはしない
 *   （Origin が "null" やパース不能な値の時に Referer で bypass されないようにするため）
 * - Origin ヘッダーが無い場合のみ Referer ヘッダーの origin で代替
 * - どちらも無い / 不一致 の場合は CSRF 違反と判定（fail-closed）
 * - `appBaseUrl` 未設定時も fail-closed で違反扱いとする。これは本番環境で
 *   環境変数の設定漏れにより CSRF 防御が silently disabled になるリスクを防ぐため
 *
 * フレームワーク非依存の純粋関数。レスポンス生成は呼び出し側に委ねる。
 *
 * @returns CSRF 違反なら true、合格なら false
 */
export function isCsrfViolation(req: Request, appBaseUrl: string | undefined): boolean {
  if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) return false;
  const expectedOrigin = appBaseUrl ? (tryParseBase(appBaseUrl)?.origin ?? null) : null;
  // appBaseUrl が未設定または不正な URL の場合は fail-closed で拒否する
  if (!expectedOrigin) return true;
  const origin = req.headers.get("origin");
  // Origin ヘッダーが存在するときは Origin のみで判定する。
  // "null" やパース不能な値でも Referer にフォールバックしないことで、
  // sandbox iframe / data: からのリクエストによる bypass を防ぐ
  if (origin !== null) {
    return (origin ? (tryParseBase(origin)?.origin ?? null) : null) !== expectedOrigin;
  }
  const referer = req.headers.get("referer");
  return (referer ? (tryParseBase(referer)?.origin ?? null) : null) !== expectedOrigin;
}
