/** 各種入力バリデーションユーティリティ */

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------
export const MAX_ID_LENGTH = 128;

// ---------------------------------------------------------------------------
// ReadState (既読・ブックマーク・後で読む・スヌーズ・メモ・タグ)
// POST は差分（追加 + removedIds）のみ送られる前提で上限を設定する。
// readIds は記事を読むたびに永続累積するため、多端末ユーザーでも余裕を持たせる。
// それでも 413 が発生した場合はクライアントが再送する（pending に復帰する）。
// ---------------------------------------------------------------------------
export const MAX_READ_IDS = 100_000;
export const MAX_BOOKMARK_IDS = 10_000;
export const MAX_READING_LIST_IDS = 10_000;
export const MAX_LIKE_IDS = 10_000;
export const MAX_SNOOZED = 500;
export const MAX_NOTES = 1_000;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TAGGED_ARTICLES = 2_000;
export const MAX_REMOVED_TAG_KEYS = 2_000;
export const MAX_TAG_NAME_LENGTH = 50;
export const MAX_TAGS_PER_ARTICLE = 20;

// ---------------------------------------------------------------------------
// エンゲージメント
// ---------------------------------------------------------------------------
export const MAX_ENGAGEMENT_ENTRIES = 5_000;

// ---------------------------------------------------------------------------
// 記事保存
// ---------------------------------------------------------------------------
export const MAX_SAVED_ARTICLES = 500;

// ---------------------------------------------------------------------------
// 推薦
// ---------------------------------------------------------------------------
export const MAX_DISMISSED_IDS = 1000;

// ---------------------------------------------------------------------------
// Push 通知
// ---------------------------------------------------------------------------
export const MAX_SUBSCRIPTIONS_PER_USER = 20;

// ---------------------------------------------------------------------------
// 画像プロキシ (Workers リクエストメモリ 128MB 制限内)
// ---------------------------------------------------------------------------
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// ---------------------------------------------------------------------------
// フィードインポート
// ---------------------------------------------------------------------------
export const MAX_OPML_ENTRIES = 5000;

// ---------------------------------------------------------------------------
// LLM CSS セレクタ再推論
// ---------------------------------------------------------------------------
export const MAX_FAILED_SELECTORS = 10;

// ---------------------------------------------------------------------------
// リリースノート
// ---------------------------------------------------------------------------
export const MAX_RELEASE_NOTES_LIMIT = 50;

// ---------------------------------------------------------------------------
// コンテンツ取得レートリミット
// ---------------------------------------------------------------------------
export const CONTENT_MAX_CALLS = 120;

// ---------------------------------------------------------------------------
// 画像プロキシレートリミット
// ---------------------------------------------------------------------------
export const IMAGE_PROXY_MAX_CALLS = 120;

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
 * tagIds のバリデーション。
 * - 値が Record<string, string[]> であることを確認
 * - key: articleId（MAX_ID_LENGTH 以内）
 * - value: タグ名の配列（各タグは MAX_TAG_NAME_LENGTH 以内、記事ごとに MAX_TAGS_PER_ARTICLE 件まで）
 * - タグ名は制御文字を除去し trim してから重複排除
 * - maxArticles 件を超える場合は先頭から切り詰め（DoS 対策）
 */
export function parseTagIds(raw: unknown, maxArticles = 1000): Record<string, string[]> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(result).length >= maxArticles) break;
    if (typeof k !== "string" || k.length === 0 || k.length > MAX_ID_LENGTH) continue;
    if (!Array.isArray(v)) continue;
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const t of v) {
      if (tags.length >= MAX_TAGS_PER_ARTICLE) break;
      if (typeof t !== "string") continue;
      const normalized = stripControlChars(t).trim();
      if (normalized.length === 0 || normalized.length > MAX_TAG_NAME_LENGTH) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      tags.push(normalized);
    }
    if (tags.length > 0) result[k] = tags;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * feedHash（16桁小文字16進数）として有効かどうかを判定する。
 * computeFeedHash が SHA-256 の先頭 16 文字を返す仕様に対応。
 */
export function isValidFeedHash(value: string): boolean {
  return /^[0-9a-f]{16}$/.test(value);
}

/**
 * snoozedUntil のバリデーション。
 * - 値が Record<string, string> であることを確認する
 * - 各エントリの key/value が文字列であることを確認する
 * - MAX_SNOOZED 件を超える場合は先頭 maxSnoozed 件に切り詰め（DoS 対策）
 * - 期限切れのエントリを除去する
 */
export function parseSnoozedUntil(raw: unknown, maxSnoozed = 500): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const now = new Date().toISOString();
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Object.keys(result).length >= maxSnoozed) break;
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
  return Object.keys(result).length > 0 ? result : null;
}
