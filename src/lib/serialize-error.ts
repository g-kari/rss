/**
 * unknown エラーをログ用の文字列に整形する。
 * Error インスタンスは `.message` を、それ以外は `String()` でフォールバックする。
 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Error オブジェクトをログ出力用のプレーンオブジェクトに展開する。
 *
 * 背景: Cloudflare Workers のログは `console.error("msg", { error })` のような呼び出しを
 * 内部で JSON.stringify するが、`Error` の `name` / `message` / `stack` は non-enumerable
 * なため `JSON.stringify(err)` は `"{}"` を返してしまい、原因が全く残らない。
 * このヘルパーで明示的に enumerable なフィールドに展開する。
 *
 * `cause`（Error.cause / `new Error(..., { cause })`）も再帰的に展開する。
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) out.stack = error.stack;
    if (error.cause !== undefined) out.cause = serializeError(error.cause);
    return out;
  }
  if (error === null) return { value: null };
  if (typeof error === "object") {
    try {
      return { value: JSON.parse(JSON.stringify(error)) as unknown };
    } catch {
      return { value: String(error) };
    }
  }
  return { value: String(error) };
}
