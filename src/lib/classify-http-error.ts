/**
 * HTTP エラーレスポンスをユーザー向けメッセージ用に分類する純粋関数 (#688)。
 *
 * クライアント側 hook (`useArticleAi` / `useArticleContent` 等) が
 * fetch 後の `!res.ok` ガード時に統一的に使う。
 *
 * 設計目的:
 *   - エラー種別 enum で「リトライ可能か」「ユーザーへ説明可能か」を明示
 *   - 429 の Retry-After ヘッダーを秒数表示に整形
 *   - 5xx は server_error、4xx は client_error として区別
 *   - hook 側はメッセージ整形のみ担当、判定ロジックは本関数に集約
 *
 * Phase 2 候補: 502 / 503 を retryable=true として hook に伝え、自動リトライへ繋げる。
 */

import { parseRetryAfter } from "./retry-after";

/** HTTP エラーの分類 enum (UI メッセージ生成 + リトライ判定用) */
export type HttpErrorType =
  | "network" // fetch そのものが失敗 (オフライン / DNS / abort 以外)
  | "rate_limit" // 429
  | "server_error" // 5xx (502 / 503 含む)
  | "client_error" // 4xx (400 / 401 / 403 / 404 等、429 を除く)
  | "unknown";

/**
 * HTTP ステータスコードから `HttpErrorType` を判定する。
 * 200 系は「エラーではない」が、呼出側で `!res.ok` ガードしている前提のため判定対象外。
 */
export function classifyHttpError(status: number): HttpErrorType {
  if (status === 429) return "rate_limit";
  if (status >= 500 && status < 600) return "server_error";
  if (status >= 400 && status < 500) return "client_error";
  return "unknown";
}

/**
 * `HttpErrorType` ごとのユーザー向けメッセージを返す。
 *
 * 429 の場合は `retryAfterHeader` を秒数に変換して「N 秒後に再試行してください」を含める。
 * `fallback` は server からのレスポンス body の `error` メッセージを優先したいときに渡す。
 *
 * @param type - 分類済 HTTP エラー種別
 * @param opts - 任意オプション
 * @param opts.retryAfterHeader - 429 のときに `Retry-After` ヘッダー値 (string | null)
 * @param opts.fallback - 上記以外のとき表示するデフォルトメッセージ
 */
export function formatHttpErrorMessage(
  type: HttpErrorType,
  opts: { retryAfterHeader?: string | null; fallback?: string } = {},
): string {
  const fallback = opts.fallback ?? "エラーが発生しました";
  switch (type) {
    case "network":
      return "ネットワークエラーが発生しました。接続を確認してください。";
    case "rate_limit": {
      const retryAfterMs = parseRetryAfter(opts.retryAfterHeader ?? null, {
        fallbackMs: 60_000,
      });
      const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return `レート制限中です。${seconds}秒後に再試行してください。`;
    }
    case "server_error":
      return "サーバーで一時的なエラーが発生しました。しばらく待ってから再試行してください。";
    case "client_error":
      return fallback;
    case "unknown":
      return fallback;
  }
}

/**
 * `HttpErrorType` がリトライで解決する見込みがあるかを返す。
 * 自動リトライ実装時の判定材料 (Phase 2 用)。
 */
export function isRetryableHttpError(type: HttpErrorType): boolean {
  return type === "rate_limit" || type === "server_error" || type === "network";
}
