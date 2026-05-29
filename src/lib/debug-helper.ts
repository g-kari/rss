/**
 * localStorage gate 経由の本番診断ログ helper factory。
 *
 * `auto-read-debug.ts` / `bgaudio-debug.ts` のような **特定機能を 1 key で gate する debug logger** の
 * 共通実装を factory として提供する。各 feature は debugKey と console prefix を渡して 3 関数 (`evaluate`
 * / `isEnabled` / `log`) を取得し、薄い wrapper で再 export する。
 *
 * 使い方:
 *   const { isEnabled, log } = createDebugHelper("rss-debug-autoread", "[AutoRead]");
 *
 * canonical 拡張ガイド:
 * - 機能ごとに **独立 STORAGE KEY** を使う (`rss-debug-<feature>` 命名)
 * - `evaluate` は pure function で test しやすく、`isEnabled` は cache 付きで高頻度 effect から呼び OK
 * - `log` は `isEnabled()` true 時のみ `console.info(prefix label, data)` で出力
 */

/** 純粋判定: storage の値から enabled かを判定 (厳密に "1" 一致)。 */
export function evaluateDebugEnabled(storedValue: string | null): boolean {
  return storedValue === "1";
}

export interface DebugHelper {
  isEnabled: () => boolean;
  log: (label: string, data: Record<string, unknown>) => void;
}

/**
 * 指定 debugKey の localStorage 値で gate される `isEnabled` / `log` ペアを返す factory。
 * `evaluate` は副作用なし pure function なので別途 `evaluateDebugEnabled` を直接 import すること。
 */
export function createDebugHelper(debugKey: string, consolePrefix: string): DebugHelper {
  let cachedEnabled: boolean | null = null;

  const isEnabled = (): boolean => {
    if (cachedEnabled !== null) return cachedEnabled;
    if (typeof window === "undefined") return false;
    try {
      cachedEnabled = evaluateDebugEnabled(window.localStorage.getItem(debugKey));
    } catch {
      cachedEnabled = false;
    }
    return cachedEnabled;
  };

  const log = (label: string, data: Record<string, unknown>): void => {
    if (!isEnabled()) return;
    // eslint-disable-next-line no-console -- 診断ログは本番でも明示的に有効化された時のみ出力
    console.info(`${consolePrefix} ${label}`, data);
  };

  return { isEnabled, log };
}
