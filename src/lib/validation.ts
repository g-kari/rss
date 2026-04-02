/** 各種入力バリデーションユーティリティ */

/** ID・文字列フィールドの最大バイト長 */
export const MAX_ID_LENGTH = 128;

/**
 * 配列バリデーション＋フィルタ＋重複排除を一括処理する。
 * 上限超過時は null を返す。
 */
export function extractIds(raw: unknown, max: number): string[] | null {
  const arr = Array.isArray(raw) ? raw : [];
  const deduped = [
    ...new Set(
      arr.filter(
        (v): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH,
      ),
    ),
  ];
  if (deduped.length > max) return null;
  return deduped;
}

/**
 * snoozedUntil のバリデーション。
 * - 値が Record<string, string> であることを確認する
 * - 各エントリの key/value が文字列であることを確認する
 * - MAX_SNOOZED 件を超える場合は全て破棄（DoS 対策）
 * - 期限切れのエントリを除去する
 */
export function parseSnoozedUntil(raw: unknown, maxSnoozed = 500): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const now = new Date().toISOString();
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (
      typeof k === "string" &&
      k.length > 0 &&
      k.length <= MAX_ID_LENGTH &&
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) &&
      v > now // 期限切れを除去
    ) {
      result[k] = v;
    }
  }
  // 件数上限: 超過した場合は全て破棄（DoS 対策）
  if (Object.keys(result).length > maxSnoozed) return null;
  return Object.keys(result).length > 0 ? result : null;
}
