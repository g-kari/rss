/**
 * AutoReadController の診断ログヘルパー (#678)。
 *
 * 本番環境でユーザーがオートモードの不具合を再現する際に、`localStorage` に
 * `rss-debug-autoread = "1"` をセットしている場合のみ console.info で詳細ログを
 * 出力する。デフォルト OFF なので一般ユーザーの DevTools を汚さない。
 *
 * 使い方 (ユーザー側):
 *   localStorage.setItem("rss-debug-autoread", "1") → リロード → 操作再現 → DevTools の Console を確認
 *   localStorage.removeItem("rss-debug-autoread") で OFF
 */

const DEBUG_KEY = "rss-debug-autoread";

let cachedEnabled: boolean | null = null;

/** 純粋判定: storage の値から enabled かを判定 (テスタビリティのため分離)。 */
export function evaluateAutoReadDebugEnabled(storedValue: string | null): boolean {
  return storedValue === "1";
}

/**
 * 診断ログが有効かどうか。`localStorage` の `rss-debug-autoread` をキャッシュして
 * 高頻度の effect 内呼び出しでも localStorage アクセスを最小化する。
 */
export function isAutoReadDebugEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === "undefined") return false;
  try {
    cachedEnabled = evaluateAutoReadDebugEnabled(window.localStorage.getItem(DEBUG_KEY));
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

/** テスト用 / hot reload 用のキャッシュリセット (通常は呼ばない)。 */
export function resetAutoReadDebugCache(): void {
  cachedEnabled = null;
}

/**
 * 診断ログを出力する。`isAutoReadDebugEnabled()` が true のときだけ console.info に
 * `[AutoRead]` prefix 付きでデータを出す。
 */
export function autoReadDebug(label: string, data: Record<string, unknown>): void {
  if (!isAutoReadDebugEnabled()) return;
  // eslint-disable-next-line no-console -- 診断ログは本番でも明示的に有効化された時のみ出力
  console.info(`[AutoRead] ${label}`, data);
}
