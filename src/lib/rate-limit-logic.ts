/**
 * スライディングウィンドウ レートリミットの純粋ロジック。
 *
 * `next/*` 非依存で切り出してあり、Playwright の Node ランナーから直接 import して
 * ユニットテストできる。`rate-limit.ts` の `checkSlidingWindow` から KV I/O と
 * NextResponse 構築を分離する目的で使用する (#618)。
 */

export interface SlidingWindowResult {
  /** 許可されるか */
  allowed: boolean;
  /** 拒否時の Retry-After 秒数（allowed=false のときのみ意味あり） */
  retryAfterSec?: number;
  /**
   * 更新後の呼び出し履歴。
   * - allowed=true: window 内に絞った既存呼び出し + 今の呼び出し（now）を末尾に追加
   * - allowed=false: window 内に絞った既存呼び出しのみ（now は追加しない）
   * 呼び出し側は許可時のみ KV に書き戻す。
   */
  recent: number[];
}

/**
 * スライディングウィンドウ判定。
 *
 * @param now      現在時刻 (ms)
 * @param stored   KV に保存されている呼び出し時刻配列（古い順 / 順不同いずれも可）
 * @param windowMs ウィンドウ幅 (ms)
 * @param maxCalls ウィンドウ内最大許可数
 * @returns SlidingWindowResult
 */
export function evaluateSlidingWindow(
  now: number,
  stored: number[],
  windowMs: number,
  maxCalls: number,
): SlidingWindowResult {
  const recent = stored.filter((t) => now - t < windowMs);
  if (recent.length >= maxCalls) {
    const oldest = recent.length > 0 ? Math.min(...recent) : now;
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSec, recent };
  }
  return { allowed: true, recent: [...recent, now] };
}
