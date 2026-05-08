/**
 * BETA_ALLOWED_SUBS が設定されている場合、sub がリストに含まれるか確認する。
 * 未設定または空文字 = 制限なし。
 *
 * `next/*` に依存しない純粋関数として切り出してあり、ユニットテストから直接 import できる。
 */
export function isBetaAllowed(sub: string): boolean {
  const list = process.env.BETA_ALLOWED_SUBS?.trim();
  if (!list) return true;
  const allowed = list.split(",").some((s) => s.trim() === sub);
  if (!allowed) {
    // pairwise sub の更新時など、設定値と実際の sub が一致しないケースの調査用ログ。
    // sub 全体を出すと共有時に流出するため、prefix と長さのみ記録する（先頭 16 文字でも
    // SHA-256 ベースの pairwise sub なら実用上の衝突はないため設定値との照合に十分）。
    console.warn("[auth/beta] sub denied by BETA_ALLOWED_SUBS", {
      subPrefix: sub.slice(0, 16),
      subLength: sub.length,
    });
  }
  return allowed;
}
