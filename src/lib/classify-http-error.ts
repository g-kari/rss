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

/** エラー種別が再試行可能かを返す（ネットワーク障害・429・5xx）。 */
export function isRetryableHttpError(type: HttpErrorType): boolean {
  return type === "network" || type === "rate_limit" || type === "server_error";
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
 * `!res.ok` 応答を整形 + 分類して `{ message, type }` を返す共通 helper (#869)。
 *
 * `useArticleContent` / `useArticleAi` で重複していた以下の処理を集約:
 *   1. `classifyHttpError(res.status)` で type 判定
 *   2. `res.json().catch(() => ({}))` で body 取得 (Cloudflare HTML エラーページ等の parse fail を捕捉)
 *   3. `formatHttpErrorMessage(type, { retryAfterHeader, fallback: body.error ?? fallback })`
 *
 * @param res - `!res.ok` ガード済の Response オブジェクト
 * @param fallback - server からの `body.error` が無い場合に表示するデフォルトメッセージ
 * @param opts.onParseError - body の JSON parse 失敗時に呼ばれる callback (debug log 用)
 * @returns `{ message: ユーザー向けメッセージ, type: HttpErrorType, retryable: boolean }`
 */
export async function buildFetchErrorMessage(
  res: Response,
  fallback: string,
  opts?: { onParseError?: (err: unknown) => void },
): Promise<{ message: string; type: HttpErrorType; retryable: boolean }> {
  const type = classifyHttpError(res.status);
  const body = (await res.json().catch((err) => {
    opts?.onParseError?.(err);
    return {};
  })) as { error?: string };
  const message = formatHttpErrorMessage(type, {
    retryAfterHeader: res.headers.get("Retry-After"),
    fallback: body.error ?? fallback,
  });
  return { message, type, retryable: isRetryableHttpError(type) };
}
