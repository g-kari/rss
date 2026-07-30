/**
 * ログ出力用の URL サニタイズ。CRLF を除去して最大長で truncate する。
 *
 * ログインジェクション対策 (`api-security.md § サーバーログに URL を出力するときは
 * ログインジェクションを防ぐ` 規範)。`console.log` / `console.error` に外部由来の URL を
 * 渡す前に必ず通すこと。
 *
 * 注意: `cron/fetch.ts` の `Last-Modified` / `ETag` / `Cache-Control` サニタイズは
 * ログ用途ではなく meta.json への永続化値のため、本 helper の対象外 (別 semantic)。
 *
 * @param value サニタイズ対象の URL 文字列
 * @param maxLength truncate する最大長（既定 256）
 * @returns CRLF 除去 + truncate 済みの文字列
 */
export function sanitizeLogUrl(value: string, maxLength = 256): string {
  return value.replace(/[\r\n]/g, "").slice(0, maxLength);
}
