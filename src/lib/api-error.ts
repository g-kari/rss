import { NextResponse } from "next/server";

/**
 * API エラーレスポンスの共通型。
 * すべての Route Handler はこの形式でエラーを返す。
 */
export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
  retryable?: boolean;
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
