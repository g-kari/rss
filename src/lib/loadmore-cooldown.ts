/**
 * #773 残問題対応: loadMore の cooldown ガード純粋関数。
 *
 * 背景 (#773 Phase 2c-fix2 残):
 * 大量画像展開時に IntersectionObserver の sentinel 出入り + secondary cascade effect
 * が頻発し、scroll が一気に末尾まで進む / 無限ロードが発生する症状をユーザー報告。
 *
 * 解決アプローチ (案 A 採用):
 * loadMore 発火後 N ms 間は次の loadMore を抑止する cooldown を導入。IO callback +
 * secondary cascade effect + 手動 loadMore() の全経路でこの判定を経由させて連続発火
 * を構造的に防ぐ。cooldown 値はユーザー判断 1000ms (false positive storm 回避と
 * 体感応答性のバランス)。
 *
 * 純粋関数として切り出して TDD で全分岐網羅 (now / lastLoadAt の前後関係 / cooldownMs
 * 境界値) を spec で固定する。
 */

/** デフォルト cooldown (ms) — #773 案 A 採用、false positive storm 回避と体感応答性のバランス */
export const DEFAULT_LOADMORE_COOLDOWN_MS = 1000;

/**
 * 直近 loadMore 発火からの経過時間で次回 loadMore を許可するか判定する純粋関数。
 *
 * `lastLoadAt = 0` (= 一度も発火していない) なら必ず true を返す (初回 loadMore)。
 * `now < lastLoadAt` (時計戻り) も含めて safe に判定する。
 *
 * @param now 現在時刻 (Date.now() の戻り値想定)
 * @param lastLoadAt 直近 loadMore 発火時刻 (0 = 未発火)
 * @param cooldownMs cooldown 期間 (デフォルト DEFAULT_LOADMORE_COOLDOWN_MS)
 * @returns true なら loadMore 発火 OK、false なら抑止
 *
 * @example
 * shouldLoadMore(2000, 0)                     // true (初回)
 * shouldLoadMore(2000, 1000, 1000)            // true (1000ms 経過、境界値)
 * shouldLoadMore(1999, 1000, 1000)            // false (999ms 経過、cooldown 中)
 * shouldLoadMore(500, 1000, 1000)             // true (時計戻り、safe fail-open)
 */
export function shouldLoadMore(
  now: number,
  lastLoadAt: number,
  cooldownMs: number = DEFAULT_LOADMORE_COOLDOWN_MS,
): boolean {
  if (lastLoadAt === 0) return true;
  if (now < lastLoadAt) return true;
  return now - lastLoadAt >= cooldownMs;
}
