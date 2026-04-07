/** 各種入力バリデーションユーティリティ */

/** ID・文字列フィールドの最大バイト長 */
export const MAX_ID_LENGTH = 128;

/** メモの最大文字数 */
export const MAX_NOTE_LENGTH = 2000;

/** 制御文字（U+0000–U+001F, U+007F）を除去する */
export function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

/** base64url 形式かつ指定バイト範囲に収まるかを検証する */
export function isValidBase64url(value: string, minBytes: number, maxBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+=*$/.test(value)) return false;
  const stripped = value.replace(/=+$/, "");
  const decodedBytes = Math.floor((stripped.length * 3) / 4);
  return decodedBytes >= minBytes && decodedBytes <= maxBytes;
}

/** ISO 8601 形式（YYYY-MM-DDTHH:mm:ss[.sss][Z|±HH:MM]）かどうかを判定する型ガード */
export function isValidIso8601(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(v)
  );
}

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
 * notes のバリデーション。
 * - 値が Record<string, string> であることを確認
 * - key: articleId（MAX_ID_LENGTH 以内）、value: メモ本文（MAX_NOTE_LENGTH 以内）
 * - MAX_NOTES 件を超える場合は先頭 maxNotes 件に切り詰め（DoS 対策）
 */
export function parseNotes(raw: unknown, maxNotes = 1000): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(result).length >= maxNotes) break;
    if (
      typeof k === "string" &&
      k.length > 0 &&
      k.length <= MAX_ID_LENGTH &&
      typeof v === "string" &&
      v.length > 0 &&
      v.length <= MAX_NOTE_LENGTH
    ) {
      result[k] = v;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
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
      isValidIso8601(v) &&
      v > now // 期限切れを除去
    ) {
      result[k] = v;
    }
  }
  // 件数上限: 超過した場合は全て破棄（DoS 対策）
  if (Object.keys(result).length > maxSnoozed) return null;
  return Object.keys(result).length > 0 ? result : null;
}
