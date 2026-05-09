import { NextResponse } from "next/server";
import { isValidFeedHash } from "./validation";

/**
 * API エラーレスポンスの共通型。
 * すべての Route Handler はこの形式でエラーを返す。
 */
export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
  retryable?: boolean;
  incident?: string; // インシデントID（5xxエラー時に設定）
  [key: string]: unknown;
}

/**
 * API エラーレスポンスを生成する。
 *
 * @param message 人間可読なエラーメッセージ
 * @param status HTTP ステータスコード
 * @param opts `code`（機械可読コード）、`hint`（ユーザー向け補足）、`retryable`（リトライ可否）など任意フィールド
 */
export function apiError(
  message: string,
  status: number,
  opts?: Omit<ApiError, "error">,
): NextResponse {
  const body: ApiError = { error: message, ...opts };
  return NextResponse.json(body, { status });
}

/**
 * feedHash パスパラメータの妥当性を検証し、不正なら `INVALID_FEED` エラーレスポンスを返す。
 * 検証 OK なら `null` を返すので呼び出し側は `if (err) return err;` で扱う。
 *
 * 5+ Route Handler (`feeds/[id]/{,refresh,reinfer,purge-content-cache}/route.ts` 等) で
 * 完全に同じ guard を書いていた重複を解消。エラーメッセージも `"Invalid feed"` で統一。
 */
export function assertValidFeedHash(feedHash: string): NextResponse | null {
  if (!isValidFeedHash(feedHash)) {
    return apiError("Invalid feed", 400, { code: "INVALID_FEED" });
  }
  return null;
}

// formatError は next/server に依存しないユニットテスト互換性のため serialize-error.ts に置く
export { formatError } from "./serialize-error";
