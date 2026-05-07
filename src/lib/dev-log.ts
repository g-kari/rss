/**
 * 開発環境でのみ console.error を出力するヘルパー。
 * `if (process.env.NODE_ENV !== 'production') console.error(...)` のガードを統一するために使用する。
 */
export function devError(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.error(...args);
}
